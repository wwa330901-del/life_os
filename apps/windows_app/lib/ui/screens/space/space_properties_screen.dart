import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/document_template.dart';
import '../../../core/models/project_property.dart';
import '../../../state/auth_provider.dart';
import '../../../state/document_templates_provider.dart';
import '../../../state/project_properties_provider.dart';

String _typeLabel(PropertyType type) => switch (type) {
  PropertyType.text => '文字',
  PropertyType.number => '數字',
  PropertyType.date => '日期',
  PropertyType.select => '單選（下拉）',
};

/// Space-level "專案設定" screen — each company space defines its own set
/// of project properties here (Notion-database-style). Gated to platform
/// admins only (see `AppSidebar`'s entry point) — this configures the
/// shape every project in the space takes, so it stays a platform-admin
/// concern rather than something any space OWNER/ADMIN can change.
class SpacePropertiesScreen extends ConsumerWidget {
  const SpacePropertiesScreen({super.key, required this.spaceId, required this.onBack});

  final String spaceId;
  final VoidCallback onBack;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(spacePropertiesProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _createDefinition(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<(String, PropertyType)>(
      context: context,
      builder: (_) => const _DefinitionDialog(),
    );
    if (result == null || !context.mounted) return;
    await _run(
      context,
      ref,
      () => ref
          .read(apiClientProvider)
          .createPropertyDefinition(spaceId: spaceId, name: result.$1, type: result.$2),
    );
  }

  /// `onReorderItem` already adjusts `newIndex` for the removed item (unlike
  /// the deprecated `onReorder`) — converts straight to the backend's "move
  /// relative to a sibling" shape (`targetId`/`insertAfter`), same as
  /// `ScheduleTab`'s work-item drag.
  Future<void> _reorder(
    BuildContext context,
    WidgetRef ref,
    List<PropertyDefinition> definitions,
    int oldIndex,
    int newIndex,
  ) async {
    if (oldIndex == newIndex) return;

    final reordered = [...definitions];
    final moved = reordered.removeAt(oldIndex);
    reordered.insert(newIndex, moved);

    final String targetId;
    final bool insertAfter;
    if (newIndex == 0) {
      targetId = reordered[1].id;
      insertAfter = false;
    } else {
      targetId = reordered[newIndex - 1].id;
      insertAfter = true;
    }

    await _run(
      context,
      ref,
      () => ref.read(apiClientProvider).reorderPropertyDefinition(
        spaceId: spaceId,
        definitionId: moved.id,
        targetId: targetId,
        insertAfter: insertAfter,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final definitionsAsync = ref.watch(spacePropertiesProvider(spaceId));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
        title: const Text('專案設定'),
      ),
      body: definitionsAsync.when(
        data: (definitions) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (definitions.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('這個空間還沒有設定任何屬性，新增專案時只會有專案名稱和開工日')),
              )
            else
              ReorderableListView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                buildDefaultDragHandles: false,
                onReorderItem: (oldIndex, newIndex) => _reorder(context, ref, definitions, oldIndex, newIndex),
                children: [
                  for (final (i, definition) in definitions.indexed)
                    Padding(
                      key: ValueKey(definition.id),
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _DefinitionCard(
                        spaceId: spaceId,
                        definition: definition,
                        index: i,
                        onChanged: () => ref.invalidate(spacePropertiesProvider(spaceId)),
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _createDefinition(context, ref),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('新增屬性'),
            ),
            _NamingTemplateSection(spaceId: spaceId, definitions: definitions),
            _DocumentTemplatesSection(
              spaceId: spaceId,
              typeOptions: definitions
                  .where((d) => d.name == '類型' && d.type == PropertyType.select)
                  .expand((d) => d.options)
                  .toList(),
            ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取失敗：$error')),
      ),
    );
  }
}

/// 案名自動命名規則 — 新增專案時，套用這條規則把選定的屬性值依序組合起來，
/// 自動帶入「案名」欄位當建議值（使用者之後仍可自由手動修改，不會被強制
/// 同步）。規則整個空間共用一套，這裡設定好，`CreateProjectDialog` 建立新
/// 專案時就會套用。
class _NamingTemplateSection extends ConsumerStatefulWidget {
  const _NamingTemplateSection({required this.spaceId, required this.definitions});

  final String spaceId;
  final List<PropertyDefinition> definitions;

  @override
  ConsumerState<_NamingTemplateSection> createState() => _NamingTemplateSectionState();
}

class _NamingTemplateSectionState extends ConsumerState<_NamingTemplateSection> {
  List<String> _selected = const [];
  final _separatorController = TextEditingController();
  bool _loadedFromServer = false;
  bool _saving = false;

  @override
  void dispose() {
    _separatorController.dispose();
    super.dispose();
  }

  void _loadOnce(NamingTemplate? template) {
    if (_loadedFromServer) return;
    _loadedFromServer = true;
    if (template != null) {
      _selected = [...template.propertyNames];
      _separatorController.text = template.separator;
    }
  }

  Future<void> _save(BuildContext context, WidgetRef ref) async {
    setState(() => _saving = true);
    try {
      if (_selected.isEmpty) {
        await ref.read(apiClientProvider).clearNamingTemplate(widget.spaceId);
      } else {
        await ref.read(apiClientProvider).updateNamingTemplate(
          spaceId: widget.spaceId,
          propertyNames: _selected,
          separator: _separatorController.text,
        );
      }
      ref.invalidate(namingTemplateProvider(widget.spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final templateAsync = ref.watch(namingTemplateProvider(widget.spaceId));
    final available = widget.definitions.where((d) => !_selected.contains(d.name)).toList();

    return templateAsync.when(
      data: (template) {
        _loadOnce(template);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 32),
            Divider(color: scheme.outline.withValues(alpha: 0.25)),
            const SizedBox(height: 16),
            Text('案名自動命名規則', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              '新增專案時，依序組合以下屬性的值，自動帶入「案名」欄位當建議值（可再手動修改）。留空代表不自動帶入。',
              style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
            ),
            const SizedBox(height: 12),
            if (_selected.isEmpty)
              const Text('（尚未選擇任何屬性）')
            else
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final name in _selected)
                    InputChip(
                      label: Text(name),
                      onDeleted: () => setState(() => _selected = [..._selected]..remove(name)),
                    ),
                ],
              ),
            const SizedBox(height: 12),
            if (available.isNotEmpty)
              PopupMenuButton<String>(
                onSelected: (name) => setState(() => _selected = [..._selected, name]),
                itemBuilder: (context) => [
                  for (final d in available) PopupMenuItem(value: d.name, child: Text(d.name)),
                ],
                child: const InputDecorator(
                  decoration: InputDecoration(labelText: '新增屬性到規則裡'),
                  child: Row(children: [Icon(Icons.add, size: 16), SizedBox(width: 6), Text('選擇屬性')]),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _separatorController,
              decoration: const InputDecoration(labelText: '分隔符號（選填，例如「-」）'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _saving ? null : () => _save(context, ref),
              child: _saving
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('儲存規則'),
            ),
          ],
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Text('讀取命名規則失敗：$error'),
    );
  }
}

/// 文件選用 — which of this space's document templates (see 大系統 doc: these
/// are ingested by hand, not uploaded here) each "類型" option may generate.
/// Read/adjust-only: no upload UI, matching how new templates are meant to
/// arrive.
class _DocumentTemplatesSection extends ConsumerWidget {
  const _DocumentTemplatesSection({required this.spaceId, required this.typeOptions});

  final String spaceId;
  final List<PropertyOption> typeOptions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final templatesAsync = ref.watch(spaceDocumentTemplatesProvider(spaceId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 32),
        Divider(color: scheme.outline.withValues(alpha: 0.25)),
        const SizedBox(height: 16),
        Text('文件選用', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          '設定每份文件範本可以用在哪些「類型」的專案',
          style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
        ),
        const SizedBox(height: 12),
        if (typeOptions.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('這個空間還沒有「類型」單選屬性，無法設定文件選用'),
          )
        else
          templatesAsync.when(
            data: (templates) {
              if (templates.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('目前沒有任何文件範本'),
                );
              }
              return Column(
                children: [
                  for (final template in templates)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _DocumentTemplateCard(
                        spaceId: spaceId,
                        template: template,
                        typeOptions: typeOptions,
                        onChanged: () => ref.invalidate(spaceDocumentTemplatesProvider(spaceId)),
                      ),
                    ),
                ],
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, _) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('讀取文件範本失敗：$error'),
            ),
          ),
      ],
    );
  }
}

class _DocumentTemplateCard extends ConsumerWidget {
  const _DocumentTemplateCard({
    required this.spaceId,
    required this.template,
    required this.typeOptions,
    required this.onChanged,
  });

  final String spaceId;
  final DocumentTemplate template;
  final List<PropertyOption> typeOptions;
  final VoidCallback onChanged;

  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  template.code,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: scheme.primary),
                ),
                const SizedBox(width: 8),
                Expanded(child: Text(template.name, style: Theme.of(context).textTheme.titleMedium)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: scheme.secondary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    template.category,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: scheme.secondary),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  tooltip: '刪除',
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('刪除文件範本？'),
                        content: Text('刪除「${template.name}」後，專案將無法再產生這份文件。'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.of(context).pop(false),
                            child: const Text('取消'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.of(context).pop(true),
                            child: const Text('刪除'),
                          ),
                        ],
                      ),
                    );
                    if (confirmed != true || !context.mounted) return;
                    await _run(
                      context,
                      () => ref
                          .read(apiClientProvider)
                          .deleteDocumentTemplate(spaceId: spaceId, templateId: template.id),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final option in typeOptions)
                  FilterChip(
                    label: Text(option.label),
                    selected: template.allowedTypeOptionIds.contains(option.id),
                    onSelected: (selected) {
                      final updated = [...template.allowedTypeOptionIds];
                      if (selected) {
                        updated.add(option.id);
                      } else {
                        updated.remove(option.id);
                      }
                      _run(
                        context,
                        () => ref
                            .read(apiClientProvider)
                            .updateDocumentTemplate(
                              spaceId: spaceId,
                              templateId: template.id,
                              allowedTypeOptionIds: updated,
                            ),
                      );
                    },
                  ),
              ],
            ),
            const SizedBox(height: 4),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: const Text('需要簽核', style: TextStyle(fontSize: 13)),
              subtitle: const Text('開啟後，這個範本產生的文件可以「送簽」進簽核系統', style: TextStyle(fontSize: 11)),
              value: template.requiresApproval,
              onChanged: (value) => _run(
                context,
                () => ref
                    .read(apiClientProvider)
                    .updateDocumentTemplate(
                      spaceId: spaceId,
                      templateId: template.id,
                      requiresApproval: value,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DefinitionCard extends ConsumerWidget {
  const _DefinitionCard({
    required this.spaceId,
    required this.definition,
    required this.index,
    required this.onChanged,
  });

  final String spaceId;
  final PropertyDefinition definition;
  final int index;
  final VoidCallback onChanged;

  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<String?> _promptLabel(BuildContext context, String title, {String initial = ''}) {
    final controller = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('確定'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ReorderableDragStartListener(
                  index: index,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Icon(Icons.drag_indicator, size: 18, color: scheme.onSurface.withValues(alpha: 0.4)),
                  ),
                ),
                Text(definition.name, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _typeLabel(definition.type),
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: scheme.primary),
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  tooltip: '重新命名',
                  onPressed: () async {
                    final name = await _promptLabel(context, '重新命名屬性', initial: definition.name);
                    if (name == null || name.isEmpty || !context.mounted) return;
                    await _run(
                      context,
                      () => ref
                          .read(apiClientProvider)
                          .renamePropertyDefinition(spaceId: spaceId, definitionId: definition.id, name: name),
                    );
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  tooltip: '刪除',
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('刪除屬性？'),
                        content: Text('刪除「${definition.name}」後，所有專案在這個屬性上的值也會一併刪除。'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.of(context).pop(false),
                            child: const Text('取消'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.of(context).pop(true),
                            child: const Text('刪除'),
                          ),
                        ],
                      ),
                    );
                    if (confirmed != true || !context.mounted) return;
                    await _run(
                      context,
                      () => ref
                          .read(apiClientProvider)
                          .deletePropertyDefinition(spaceId: spaceId, definitionId: definition.id),
                    );
                  },
                ),
              ],
            ),
            if (definition.type == PropertyType.select) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final option in definition.options)
                    InputChip(
                      label: Text(option.label),
                      onPressed: () async {
                        final label = await _promptLabel(context, '重新命名選項', initial: option.label);
                        if (label == null || label.isEmpty || !context.mounted) return;
                        await _run(
                          context,
                          () => ref.read(apiClientProvider).renamePropertyOption(
                            spaceId: spaceId,
                            definitionId: definition.id,
                            optionId: option.id,
                            label: label,
                          ),
                        );
                      },
                      onDeleted: () => _run(
                        context,
                        () => ref.read(apiClientProvider).deletePropertyOption(
                          spaceId: spaceId,
                          definitionId: definition.id,
                          optionId: option.id,
                        ),
                      ),
                    ),
                  ActionChip(
                    avatar: const Icon(Icons.add, size: 16),
                    label: const Text('新增選項'),
                    onPressed: () async {
                      final label = await _promptLabel(context, '新增選項');
                      if (label == null || label.isEmpty || !context.mounted) return;
                      await _run(
                        context,
                        () => ref
                            .read(apiClientProvider)
                            .addPropertyOption(spaceId: spaceId, definitionId: definition.id, label: label),
                      );
                    },
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DefinitionDialog extends StatefulWidget {
  const _DefinitionDialog();

  @override
  State<_DefinitionDialog> createState() => _DefinitionDialogState();
}

class _DefinitionDialogState extends State<_DefinitionDialog> {
  final _nameController = TextEditingController();
  PropertyType _type = PropertyType.text;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('新增屬性'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(labelText: '屬性名稱'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<PropertyType>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: '型態'),
              items: [
                for (final type in PropertyType.values)
                  DropdownMenuItem(value: type, child: Text(_typeLabel(type))),
              ],
              onChanged: (value) => setState(() => _type = value ?? _type),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () {
            final name = _nameController.text.trim();
            if (name.isEmpty) return;
            Navigator.of(context).pop((name, _type));
          },
          child: const Text('新增'),
        ),
      ],
    );
  }
}
