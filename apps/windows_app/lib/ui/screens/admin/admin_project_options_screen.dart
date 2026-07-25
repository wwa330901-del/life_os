import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/project.dart';
import '../../../state/auth_provider.dart';
import '../../../state/project_options_provider.dart';

/// Platform-admin management of the 類型/狀態 dropdown option lists every
/// project's create/edit form picks from — the Notion-database-style
/// "define the select options" screen the user asked for.
class AdminProjectOptionsScreen extends ConsumerWidget {
  const AdminProjectOptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('專案類型/狀態管理')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _OptionSection(
            title: '類型',
            optionsAsync: ref.watch(projectTypeOptionsProvider),
            onAdd: (label) => ref.read(apiClientProvider).adminCreateProjectTypeOption(label),
            onRename: (id, label) => ref.read(apiClientProvider).adminRenameProjectTypeOption(id, label),
            onDelete: (id) => ref.read(apiClientProvider).adminDeleteProjectTypeOption(id),
            invalidate: () => ref.invalidate(projectTypeOptionsProvider),
          ),
          const SizedBox(height: 24),
          _OptionSection(
            title: '狀態',
            optionsAsync: ref.watch(projectStatusOptionsProvider),
            onAdd: (label) => ref.read(apiClientProvider).adminCreateProjectStatusOption(label),
            onRename: (id, label) => ref.read(apiClientProvider).adminRenameProjectStatusOption(id, label),
            onDelete: (id) => ref.read(apiClientProvider).adminDeleteProjectStatusOption(id),
            invalidate: () => ref.invalidate(projectStatusOptionsProvider),
          ),
        ],
      ),
    );
  }
}

class _OptionSection extends StatelessWidget {
  const _OptionSection({
    required this.title,
    required this.optionsAsync,
    required this.onAdd,
    required this.onRename,
    required this.onDelete,
    required this.invalidate,
  });

  final String title;
  final AsyncValue<List<ProjectOption>> optionsAsync;
  final Future<void> Function(String label) onAdd;
  final Future<void> Function(String id, String label) onRename;
  final Future<void> Function(String id) onDelete;
  final VoidCallback invalidate;

  Future<String?> _promptLabel(BuildContext context, {String initial = ''}) {
    final controller = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(initial.isEmpty ? '新增$title' : '重新命名'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(labelText: title),
        ),
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

  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
      invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                TextButton.icon(
                  onPressed: () async {
                    final label = await _promptLabel(context);
                    if (label == null || label.isEmpty || !context.mounted) return;
                    await _run(context, () => onAdd(label));
                  },
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('新增'),
                ),
              ],
            ),
            optionsAsync.when(
              data: (options) {
                if (options.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: Text('目前沒有任何選項'),
                  );
                }
                return Column(
                  children: [
                    for (final option in options)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(option.label),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              tooltip: '重新命名',
                              onPressed: () async {
                                final label = await _promptLabel(context, initial: option.label);
                                if (label == null || label.isEmpty || !context.mounted) return;
                                await _run(context, () => onRename(option.id, label));
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18),
                              tooltip: '刪除',
                              onPressed: () => _run(context, () => onDelete(option.id)),
                            ),
                          ],
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
                child: Text('讀取失敗：$error'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
