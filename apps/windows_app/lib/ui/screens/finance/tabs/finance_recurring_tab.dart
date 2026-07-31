import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';

/// "每月第 N 天做一次某件事" — 信用卡費/房租/訂閱這類會重複發生的交易。有填金額
/// 的（房租、訂閱這種固定金額）到期會自動記一筆＋傳 LINE 通知；沒填金額的（信用
/// 卡費這種每月數字不固定的）到期只傳 LINE 提醒，交易本身還是要使用者自己記。
class FinanceRecurringTab extends ConsumerWidget {
  const FinanceRecurringTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recurringAsync = ref.watch(financeRecurringTransactionsProvider(spaceId));
    final accountsAsync = ref.watch(financeAccountsProvider(spaceId));
    final categoriesAsync = ref.watch(financeCategoriesProvider(spaceId));

    final accounts = accountsAsync.value ?? const [];
    final categories = categoriesAsync.value ?? const [];
    final accountNameOf = {for (final a in accounts) a.id: a.name};
    final categoryById = {for (final c in categories) c.id: c};
    final categoryNameOf = {
      for (final c in categories)
        c.id: c.parentId == null ? c.name : '${c.name}（${categoryById[c.parentId]?.name ?? ''}）',
    };

    return Scaffold(
      floatingActionButton: accounts.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openEditor(context, ref, accounts, categories, null),
              icon: const Icon(Icons.add),
              label: const Text('新增定期交易'),
            ),
      body: accounts.isEmpty
          ? const Center(child: Text('要先在「帳戶」分頁新增至少一個帳戶'))
          : recurringAsync.when(
              data: (items) {
                if (items.isEmpty) {
                  return const Center(
                    child: Text('還沒有任何定期交易\n例如每月要繳的信用卡費、房租、訂閱', textAlign: TextAlign.center),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final r = items[index];
                    return Card(
                      child: ListTile(
                        leading: Icon(_iconFor(r.type), color: r.active ? null : Theme.of(context).disabledColor),
                        title: Text(
                          _titleFor(r, accountNameOf, categoryNameOf),
                          style: r.active ? null : TextStyle(color: Theme.of(context).disabledColor),
                        ),
                        subtitle: Text(
                          '每月 ${r.dayOfMonth} 日'
                          '${r.amount == null ? '（金額不固定，到期只提醒）' : '（自動記帳 ${formatAmount(r.amount!)}）'}'
                          '${!r.active ? ' · 已停用' : ''}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Switch(
                              value: r.active,
                              onChanged: (value) => _toggleActive(context, ref, r, value),
                            ),
                            IconButton(
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              onPressed: () => _openEditor(context, ref, accounts, categories, r),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18),
                              onPressed: () => _delete(context, ref, r),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取定期交易失敗：$error')),
            ),
    );
  }

  IconData _iconFor(FinanceTransactionType type) => switch (type) {
    FinanceTransactionType.income => Icons.arrow_downward,
    FinanceTransactionType.expense => Icons.arrow_upward,
    FinanceTransactionType.transfer => Icons.swap_horiz,
  };

  String _titleFor(
    FinanceRecurringTransaction r,
    Map<String, String> accountNameOf,
    Map<String, String> categoryNameOf,
  ) {
    if (r.note != null && r.note!.isNotEmpty) return r.note!;
    final accountName = accountNameOf[r.accountId] ?? '?';
    if (r.type == FinanceTransactionType.transfer) {
      final toName = accountNameOf[r.toAccountId] ?? '?';
      return '$accountName → $toName';
    }
    final categoryName = r.categoryId == null ? '未分類' : (categoryNameOf[r.categoryId] ?? '未分類');
    return '$categoryName · $accountName';
  }

  void _invalidate(WidgetRef ref) {
    ref.invalidate(financeRecurringTransactionsProvider(spaceId));
  }

  Future<void> _toggleActive(
    BuildContext context,
    WidgetRef ref,
    FinanceRecurringTransaction r,
    bool active,
  ) async {
    try {
      await ref
          .read(apiClientProvider)
          .updateFinanceRecurringTransaction(spaceId: spaceId, id: r.id, active: active);
      _invalidate(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, FinanceRecurringTransaction r) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除定期交易'),
        content: const Text('確定要刪除這筆定期交易嗎？這個動作無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteFinanceRecurringTransaction(spaceId: spaceId, id: r.id);
      _invalidate(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref,
    List<FinanceAccount> accounts,
    List<FinanceCategory> categories,
    FinanceRecurringTransaction? existing,
  ) async {
    final result = await showDialog<_RecurringEditorResult>(
      context: context,
      builder: (_) => _RecurringEditorDialog(accounts: accounts, categories: categories, existing: existing),
    );
    if (result == null || !context.mounted) return;

    try {
      final api = ref.read(apiClientProvider);
      if (existing == null) {
        await api.createFinanceRecurringTransaction(
          spaceId: spaceId,
          type: result.type,
          amount: result.amount,
          accountId: result.accountId,
          toAccountId: result.toAccountId,
          categoryId: result.categoryId,
          dayOfMonth: result.dayOfMonth,
          note: result.note,
        );
      } else {
        await api.updateFinanceRecurringTransaction(
          spaceId: spaceId,
          id: existing.id,
          type: result.type,
          amount: result.amount,
          clearAmount: result.amount == null,
          accountId: result.accountId,
          toAccountId: result.type == FinanceTransactionType.transfer ? result.toAccountId : null,
          categoryId: result.categoryId,
          dayOfMonth: result.dayOfMonth,
          note: result.note ?? '',
        );
      }
      _invalidate(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _RecurringEditorResult {
  const _RecurringEditorResult({
    required this.type,
    required this.amount,
    required this.accountId,
    required this.toAccountId,
    required this.categoryId,
    required this.dayOfMonth,
    required this.note,
  });

  final FinanceTransactionType type;
  final double? amount;
  final String accountId;
  final String? toAccountId;
  final String? categoryId;
  final int dayOfMonth;
  final String? note;
}

class _RecurringEditorDialog extends StatefulWidget {
  const _RecurringEditorDialog({required this.accounts, required this.categories, this.existing});

  final List<FinanceAccount> accounts;
  final List<FinanceCategory> categories;
  final FinanceRecurringTransaction? existing;

  @override
  State<_RecurringEditorDialog> createState() => _RecurringEditorDialogState();
}

class _RecurringEditorDialogState extends State<_RecurringEditorDialog> {
  late FinanceTransactionType _type = widget.existing?.type ?? FinanceTransactionType.expense;
  late String? _accountId = widget.existing?.accountId ?? widget.accounts.firstOrNull?.id;
  late String? _toAccountId = widget.existing?.toAccountId;
  late String? _categoryId = widget.existing?.categoryId;
  late final _amountController = TextEditingController(
    text: widget.existing?.amount == null ? '' : widget.existing!.amount!.toStringAsFixed(0),
  );
  late final _dayController = TextEditingController(text: '${widget.existing?.dayOfMonth ?? 1}');
  late final _noteController = TextEditingController(text: widget.existing?.note ?? '');

  @override
  void dispose() {
    _amountController.dispose();
    _dayController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  List<FinanceCategory> get _categoriesForType => widget.categories.leaves
      .where((c) => (_type == FinanceTransactionType.income) == (c.kind == FinanceCategoryKind.income))
      .toList();

  String _categoryLabel(FinanceCategory category) {
    if (category.parentId == null) return category.name;
    final parent = widget.categories.where((c) => c.id == category.parentId).firstOrNull;
    return parent == null ? category.name : '${category.name}（${parent.name}）';
  }

  void _submit() {
    final accountId = _accountId;
    if (accountId == null) return;
    final day = int.tryParse(_dayController.text);
    if (day == null || day < 1 || day > 31) return;
    if (_type == FinanceTransactionType.transfer && (_toAccountId == null || _toAccountId == accountId)) {
      return;
    }
    final amountText = _amountController.text.trim();
    final amount = amountText.isEmpty ? null : double.tryParse(amountText);
    if (amountText.isNotEmpty && (amount == null || amount <= 0)) return;

    Navigator.of(context).pop(
      _RecurringEditorResult(
        type: _type,
        amount: amount,
        accountId: accountId,
        toAccountId: _type == FinanceTransactionType.transfer ? _toAccountId : null,
        categoryId: _type == FinanceTransactionType.transfer ? null : _categoryId,
        dayOfMonth: day,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? '新增定期交易' : '編輯定期交易'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<FinanceTransactionType>(
                segments: const [
                  ButtonSegment(value: FinanceTransactionType.expense, label: Text('支出')),
                  ButtonSegment(value: FinanceTransactionType.income, label: Text('收入')),
                  ButtonSegment(value: FinanceTransactionType.transfer, label: Text('轉帳')),
                ],
                selected: {_type},
                onSelectionChanged: (selection) => setState(() {
                  _type = selection.first;
                  _categoryId = null;
                }),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _dayController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '每月第幾天', helperText: '1-31，超過當月天數會用當月最後一天'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: '金額（選填）',
                  helperText: '有填：到期自動記這筆＋LINE通知；不填：到期只傳LINE提醒，自己去記',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _accountId,
                decoration: InputDecoration(
                  labelText: _type == FinanceTransactionType.transfer ? '從帳戶' : '帳戶',
                ),
                items: widget.accounts
                    .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name)))
                    .toList(),
                onChanged: (value) => setState(() => _accountId = value),
              ),
              if (_type == FinanceTransactionType.transfer) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _toAccountId,
                  decoration: const InputDecoration(labelText: '到帳戶'),
                  items: widget.accounts
                      .where((a) => a.id != _accountId)
                      .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name)))
                      .toList(),
                  onChanged: (value) => setState(() => _toAccountId = value),
                ),
              ] else ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _categoriesForType.any((c) => c.id == _categoryId) ? _categoryId : null,
                  decoration: const InputDecoration(labelText: '分類'),
                  items: _categoriesForType
                      .map((c) => DropdownMenuItem(value: c.id, child: Text(_categoryLabel(c))))
                      .toList(),
                  onChanged: (value) => setState(() => _categoryId = value),
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(labelText: '名稱／備註（選填，例如「信用卡費」）'),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('儲存')),
      ],
    );
  }
}
