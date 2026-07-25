import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/project_property.dart';
import '../../../state/auth_provider.dart';
import '../../../state/project_properties_provider.dart';

String _typeLabel(PropertyType type) => switch (type) {
  PropertyType.text => '文字',
  PropertyType.number => '數字',
  PropertyType.date => '日期',
  PropertyType.select => '單選（下拉）',
};

/// Space-level "屬性設定" screen — each company space defines its own set
/// of project properties here (Notion-database-style), gated to that
/// space's own OWNER/ADMIN (see `AppSidebar`'s entry point), not the
/// platform admin console.
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final definitionsAsync = ref.watch(spacePropertiesProvider(spaceId));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
        title: const Text('專案屬性設定'),
      ),
      body: definitionsAsync.when(
        data: (definitions) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (definitions.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('這個空間還沒有設定任何屬性，新增專案時只會有專案名稱和開工日')),
              ),
            for (final definition in definitions)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _DefinitionCard(
                  spaceId: spaceId,
                  definition: definition,
                  onChanged: () => ref.invalidate(spacePropertiesProvider(spaceId)),
                ),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _createDefinition(context, ref),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('新增屬性'),
            ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取失敗：$error')),
      ),
    );
  }
}

class _DefinitionCard extends ConsumerWidget {
  const _DefinitionCard({required this.spaceId, required this.definition, required this.onChanged});

  final String spaceId;
  final PropertyDefinition definition;
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
