import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/knowledge.dart';
import '../../../state/auth_provider.dart';
import '../../../state/knowledge_provider.dart';

/// 知識庫分類設定 — each category is entirely self-managed by its owner: its
/// own name, public/private toggle, custom fields, and (while public) a
/// per-account blacklist. Mirrors SpacePropertiesScreen's "add the shell
/// first, then add fields/options one at a time" flow.
class KnowledgeCategorySettingsScreen extends ConsumerWidget {
  const KnowledgeCategorySettingsScreen({super.key, required this.onBack});

  final VoidCallback onBack;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(knowledgeCategoriesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _createCategory(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<(String, bool)>(context: context, builder: (_) => const _CategoryDialog());
    if (result == null || !context.mounted) return;
    await _run(
      context,
      ref,
      () => ref.read(apiClientProvider).createKnowledgeCategory(name: result.$1, isPublic: result.$2, fields: const []),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoriesAsync = ref.watch(knowledgeCategoriesProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
        title: const Text('知識庫分類設定'),
      ),
      body: categoriesAsync.when(
        data: (categories) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (categories.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('還沒有任何分類，新增一個開始收集知識吧')),
              ),
            for (final category in categories)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _CategoryCard(category: category),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _createCategory(context, ref),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('新增分類'),
            ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取失敗：$error')),
      ),
    );
  }
}

class _CategoryCard extends ConsumerWidget {
  const _CategoryCard({required this.category});

  final KnowledgeCategory category;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(knowledgeCategoriesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<String?> _promptText(BuildContext context, String title, {String initial = ''}) {
    final controller = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text.trim()), child: const Text('確定')),
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
                Text(category.name, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(width: 12),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  tooltip: '重新命名',
                  onPressed: () async {
                    final name = await _promptText(context, '重新命名分類', initial: category.name);
                    if (name == null || name.isEmpty || !context.mounted) return;
                    await _run(
                      context,
                      ref,
                      () => ref.read(apiClientProvider).updateKnowledgeCategory(categoryId: category.id, name: name),
                    );
                  },
                ),
                const Spacer(),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(category.isPublic ? '公開' : '私人', style: TextStyle(color: scheme.primary)),
                    Switch(
                      value: category.isPublic,
                      onChanged: (value) => _run(
                        context,
                        ref,
                        () => ref
                            .read(apiClientProvider)
                            .updateKnowledgeCategory(categoryId: category.id, isPublic: value),
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  tooltip: '刪除分類',
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('刪除分類？'),
                        content: Text('刪除「${category.name}」後，這個分類底下所有的知識庫資料也會一併刪除。'),
                        actions: [
                          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
                          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
                        ],
                      ),
                    );
                    if (confirmed != true || !context.mounted) return;
                    await _run(
                      context,
                      ref,
                      () => ref.read(apiClientProvider).deleteKnowledgeCategory(category.id),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text('欄位', style: Theme.of(context).textTheme.labelMedium),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final field in category.fields)
                  InputChip(
                    label: Text('${field.name}（${field.type.label}）'),
                    onPressed: () async {
                      final name = await _promptText(context, '重新命名欄位', initial: field.name);
                      if (name == null || name.isEmpty || !context.mounted) return;
                      await _run(
                        context,
                        ref,
                        () => ref
                            .read(apiClientProvider)
                            .renameKnowledgeField(categoryId: category.id, fieldId: field.id, name: name),
                      );
                    },
                    onDeleted: () => _run(
                      context,
                      ref,
                      () => ref
                          .read(apiClientProvider)
                          .removeKnowledgeField(categoryId: category.id, fieldId: field.id),
                    ),
                  ),
                ActionChip(
                  avatar: const Icon(Icons.add, size: 16),
                  label: const Text('新增欄位'),
                  onPressed: () async {
                    final result = await showDialog<(String, KnowledgeFieldType)>(
                      context: context,
                      builder: (_) => const _FieldDialog(),
                    );
                    if (result == null || !context.mounted) return;
                    await _run(
                      context,
                      ref,
                      () => ref
                          .read(apiClientProvider)
                          .addKnowledgeField(categoryId: category.id, name: result.$1, type: result.$2),
                    );
                  },
                ),
              ],
            ),
            if (category.isPublic) ...[
              const SizedBox(height: 12),
              Text('封鎖名單（這些人看不到這個分類的公開資料）', style: Theme.of(context).textTheme.labelMedium),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final blocked in category.blacklistedUsers)
                    InputChip(
                      label: Text(blocked.name),
                      onDeleted: () => _run(
                        context,
                        ref,
                        () => ref
                            .read(apiClientProvider)
                            .removeKnowledgeBlacklistEntry(categoryId: category.id, blockedUserId: blocked.id),
                      ),
                    ),
                  ActionChip(
                    avatar: const Icon(Icons.person_off_outlined, size: 16),
                    label: const Text('封鎖某人'),
                    onPressed: () async {
                      final email = await _promptText(context, '輸入要封鎖的人的 email');
                      if (email == null || email.isEmpty || !context.mounted) return;
                      await _run(
                        context,
                        ref,
                        () => ref
                            .read(apiClientProvider)
                            .addKnowledgeBlacklistEntry(categoryId: category.id, email: email),
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

class _CategoryDialog extends StatefulWidget {
  const _CategoryDialog();

  @override
  State<_CategoryDialog> createState() => _CategoryDialogState();
}

class _CategoryDialogState extends State<_CategoryDialog> {
  final _nameController = TextEditingController();
  bool _isPublic = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('新增分類'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(labelText: '分類名稱'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('公開給其他人看'),
              value: _isPublic,
              onChanged: (value) => setState(() => _isPublic = value),
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
            Navigator.of(context).pop((name, _isPublic));
          },
          child: const Text('新增'),
        ),
      ],
    );
  }
}

class _FieldDialog extends StatefulWidget {
  const _FieldDialog();

  @override
  State<_FieldDialog> createState() => _FieldDialogState();
}

class _FieldDialogState extends State<_FieldDialog> {
  final _nameController = TextEditingController();
  KnowledgeFieldType _type = KnowledgeFieldType.text;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('新增欄位'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(labelText: '欄位名稱'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<KnowledgeFieldType>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: '型態'),
              items: [
                for (final type in KnowledgeFieldType.values)
                  DropdownMenuItem(value: type, child: Text(type.label)),
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
