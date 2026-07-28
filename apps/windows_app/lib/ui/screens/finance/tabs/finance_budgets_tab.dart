import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';

/// Standing monthly targets per (expense) category — 收入 categories don't
/// get a budget, there's nothing to cap.
class FinanceBudgetsTab extends ConsumerWidget {
  const FinanceBudgetsTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoriesAsync = ref.watch(financeCategoriesProvider(spaceId));
    final budgetsAsync = ref.watch(financeBudgetsProvider(spaceId));

    return categoriesAsync.when(
      data: (categories) {
        final expenseCategories = categories.where((c) => c.kind == FinanceCategoryKind.expense).toList();
        return budgetsAsync.when(
          data: (budgets) {
            final budgetByCategory = {for (final b in budgets) b.categoryId: b};
            if (expenseCategories.isEmpty) {
              return const Center(child: Text('還沒有任何支出分類，先到「分類」分頁新增'));
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: expenseCategories.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final category = expenseCategories[index];
                final budget = budgetByCategory[category.id];
                return Card(
                  child: ListTile(
                    title: Text(category.name),
                    subtitle: Text(budget == null ? '尚未設定預算' : '每月預算 ${budget.monthlyAmount.toStringAsFixed(0)}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextButton(
                          onPressed: () => _setBudget(context, ref, category, budget),
                          child: Text(budget == null ? '設定' : '修改'),
                        ),
                        if (budget != null)
                          IconButton(
                            icon: const Icon(Icons.delete_outline, size: 18),
                            onPressed: () => _removeBudget(context, ref, budget),
                          ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('讀取預算失敗：$error')),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取分類失敗：$error')),
    );
  }

  Future<void> _setBudget(
    BuildContext context,
    WidgetRef ref,
    FinanceCategory category,
    FinanceBudget? existing,
  ) async {
    final controller = TextEditingController(
      text: existing == null ? '' : existing.monthlyAmount.toStringAsFixed(0),
    );
    final amount = await showDialog<double>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${category.name} 的每月預算'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: '金額'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(double.tryParse(controller.text)),
            child: const Text('儲存'),
          ),
        ],
      ),
    );
    if (amount == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .upsertFinanceBudget(spaceId: spaceId, categoryId: category.id, monthlyAmount: amount);
      ref.invalidate(financeBudgetsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _removeBudget(BuildContext context, WidgetRef ref, FinanceBudget budget) async {
    try {
      await ref.read(apiClientProvider).deleteFinanceBudget(spaceId: spaceId, budgetId: budget.id);
      ref.invalidate(financeBudgetsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
