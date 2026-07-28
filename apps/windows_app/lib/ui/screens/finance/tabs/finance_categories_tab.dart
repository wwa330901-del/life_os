import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';

class FinanceCategoriesTab extends ConsumerWidget {
  const FinanceCategoriesTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoriesAsync = ref.watch(financeCategoriesProvider(spaceId));

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context, ref, spaceId, null),
        icon: const Icon(Icons.add),
        label: const Text('新增分類'),
      ),
      body: categoriesAsync.when(
        data: (categories) {
          final income = categories.where((c) => c.kind == FinanceCategoryKind.income).toList();
          final expense = categories.where((c) => c.kind == FinanceCategoryKind.expense).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              Text('支出分類', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final category in expense) _CategoryTile(category: category, ref: ref, spaceId: spaceId),
              const SizedBox(height: 24),
              Text('收入分類', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final category in income) _CategoryTile(category: category, ref: ref, spaceId: spaceId),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取分類失敗：$error')),
      ),
    );
  }

  static Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref,
    String spaceId,
    FinanceCategory? existing,
  ) async {
    final nameController = TextEditingController(text: existing?.name ?? '');
    var kind = existing?.kind ?? FinanceCategoryKind.expense;

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增分類' : '重新命名分類'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: const InputDecoration(labelText: '分類名稱'),
              ),
              if (existing == null) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<FinanceCategoryKind>(
                  initialValue: kind,
                  decoration: const InputDecoration(labelText: '收入 / 支出'),
                  items: FinanceCategoryKind.values
                      .map((k) => DropdownMenuItem(value: k, child: Text(k.label)))
                      .toList(),
                  onChanged: (value) => setState(() => kind = value ?? kind),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;

    final name = nameController.text.trim();
    if (name.isEmpty) return;

    try {
      if (existing == null) {
        await ref.read(apiClientProvider).createFinanceCategory(spaceId: spaceId, name: name, kind: kind);
      } else {
        await ref
            .read(apiClientProvider)
            .updateFinanceCategory(spaceId: spaceId, categoryId: existing.id, name: name);
      }
      ref.invalidate(financeCategoriesProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.category, required this.ref, required this.spaceId});

  final FinanceCategory category;
  final WidgetRef ref;
  final String spaceId;

  Future<void> _delete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除分類'),
        content: Text('確定要刪除「${category.name}」嗎？這個分類過去的交易紀錄會變成「未分類」，不會被刪除。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .deleteFinanceCategory(spaceId: spaceId, categoryId: category.id);
      ref.invalidate(financeCategoriesProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(category.name),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 18),
              onPressed: () => FinanceCategoriesTab._openEditor(context, ref, spaceId, category),
            ),
            IconButton(icon: const Icon(Icons.delete_outline, size: 18), onPressed: () => _delete(context)),
          ],
        ),
      ),
    );
  }
}
