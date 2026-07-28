import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_month_selector.dart';

class FinanceTransactionsTab extends ConsumerStatefulWidget {
  const FinanceTransactionsTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<FinanceTransactionsTab> createState() => _FinanceTransactionsTabState();
}

class _FinanceTransactionsTabState extends ConsumerState<FinanceTransactionsTab> {
  late String _month = currentMonthKey();

  @override
  Widget build(BuildContext context) {
    final query = (spaceId: widget.spaceId, month: _month);
    final transactionsAsync = ref.watch(financeTransactionsProvider(query));
    final accountsAsync = ref.watch(financeAccountsProvider(widget.spaceId));
    final categoriesAsync = ref.watch(financeCategoriesProvider(widget.spaceId));

    final accounts = accountsAsync.value ?? const [];
    final categories = categoriesAsync.value ?? const [];
    final accountNameOf = {for (final a in accounts) a.id: a.name};
    final categoryNameOf = {for (final c in categories) c.id: c.name};

    return Scaffold(
      floatingActionButton: (accounts.isEmpty)
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openEditor(context, accounts, categories, null),
              icon: const Icon(Icons.add),
              label: const Text('新增交易'),
            ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: FinanceMonthSelector(
              month: _month,
              onChanged: (m) => setState(() => _month = m),
            ),
          ),
          if (accounts.isEmpty)
            const Expanded(child: Center(child: Text('要先在「帳戶」分頁新增至少一個帳戶，才能記交易')))
          else
            Expanded(
              child: transactionsAsync.when(
                data: (transactions) {
                  if (transactions.isEmpty) {
                    return const Center(child: Text('這個月還沒有任何交易'));
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
                    itemCount: transactions.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final t = transactions[index];
                      return Card(
                        child: ListTile(
                          leading: Icon(_iconFor(t.type)),
                          title: Text(_titleFor(t, accountNameOf, categoryNameOf)),
                          subtitle: Text(
                            '${t.date.month}/${t.date.day}'
                            '${t.note != null && t.note!.isNotEmpty ? ' · ${t.note}' : ''}',
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${t.type == FinanceTransactionType.income ? '+' : t.type == FinanceTransactionType.expense ? '-' : ''}'
                                '${t.amount.toStringAsFixed(0)}',
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  color: t.type == FinanceTransactionType.income
                                      ? Colors.green
                                      : t.type == FinanceTransactionType.expense
                                      ? Theme.of(context).colorScheme.error
                                      : null,
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.edit_outlined, size: 18),
                                onPressed: () => _openEditor(context, accounts, categories, t),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline, size: 18),
                                onPressed: () => _delete(context, t),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(child: Text('讀取交易失敗：$error')),
              ),
            ),
        ],
      ),
    );
  }

  IconData _iconFor(FinanceTransactionType type) => switch (type) {
    FinanceTransactionType.income => Icons.arrow_downward,
    FinanceTransactionType.expense => Icons.arrow_upward,
    FinanceTransactionType.transfer => Icons.swap_horiz,
  };

  String _titleFor(
    FinanceTransaction t,
    Map<String, String> accountNameOf,
    Map<String, String> categoryNameOf,
  ) {
    final accountName = accountNameOf[t.accountId] ?? '?';
    if (t.type == FinanceTransactionType.transfer) {
      final toName = accountNameOf[t.toAccountId] ?? '?';
      return '$accountName → $toName';
    }
    final categoryName = t.categoryId == null ? '未分類' : (categoryNameOf[t.categoryId] ?? '未分類');
    return '$categoryName · $accountName';
  }

  void _invalidate() {
    ref.invalidate(financeTransactionsProvider((spaceId: widget.spaceId, month: _month)));
    ref.invalidate(financeAccountsProvider(widget.spaceId));
  }

  Future<void> _delete(BuildContext context, FinanceTransaction transaction) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除交易'),
        content: const Text('確定要刪除這筆交易嗎？這個動作無法復原。'),
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
          .deleteFinanceTransaction(spaceId: widget.spaceId, transactionId: transaction.id);
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditor(
    BuildContext context,
    List<FinanceAccount> accounts,
    List<FinanceCategory> categories,
    FinanceTransaction? existing,
  ) async {
    final result = await showDialog<_TransactionEditorResult>(
      context: context,
      builder: (_) => _TransactionEditorDialog(accounts: accounts, categories: categories, existing: existing),
    );
    if (result == null || !context.mounted) return;

    try {
      final api = ref.read(apiClientProvider);
      if (existing == null) {
        await api.createFinanceTransaction(
          spaceId: widget.spaceId,
          type: result.type,
          amount: result.amount,
          accountId: result.accountId,
          toAccountId: result.toAccountId,
          categoryId: result.categoryId,
          date: result.date,
          note: result.note,
        );
      } else {
        await api.updateFinanceTransaction(
          spaceId: widget.spaceId,
          transactionId: existing.id,
          type: result.type,
          amount: result.amount,
          accountId: result.accountId,
          toAccountId: result.toAccountId,
          categoryId: result.categoryId,
          date: result.date,
          note: result.note,
        );
      }
      _invalidate();
      if (!result.date.isSameMonth(DateTime.parse('$_month-01'))) {
        setState(() => _month = FinanceMonthSelector.monthKeyOf(result.date));
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

extension on DateTime {
  bool isSameMonth(DateTime other) => year == other.year && month == other.month;
}

class _TransactionEditorResult {
  const _TransactionEditorResult({
    required this.type,
    required this.amount,
    required this.accountId,
    required this.toAccountId,
    required this.categoryId,
    required this.date,
    required this.note,
  });

  final FinanceTransactionType type;
  final double amount;
  final String accountId;
  final String? toAccountId;
  final String? categoryId;
  final DateTime date;
  final String? note;
}

class _TransactionEditorDialog extends StatefulWidget {
  const _TransactionEditorDialog({required this.accounts, required this.categories, this.existing});

  final List<FinanceAccount> accounts;
  final List<FinanceCategory> categories;
  final FinanceTransaction? existing;

  @override
  State<_TransactionEditorDialog> createState() => _TransactionEditorDialogState();
}

class _TransactionEditorDialogState extends State<_TransactionEditorDialog> {
  late FinanceTransactionType _type = widget.existing?.type ?? FinanceTransactionType.expense;
  late String? _accountId = widget.existing?.accountId ?? widget.accounts.firstOrNull?.id;
  late String? _toAccountId = widget.existing?.toAccountId;
  late String? _categoryId = widget.existing?.categoryId;
  late DateTime _date = widget.existing?.date ?? DateTime.now();
  late final _amountController = TextEditingController(
    text: widget.existing == null ? '' : widget.existing!.amount.toStringAsFixed(0),
  );
  late final _noteController = TextEditingController(text: widget.existing?.note ?? '');

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  List<FinanceCategory> get _categoriesForType => widget.categories
      .where(
        (c) =>
            (_type == FinanceTransactionType.income) == (c.kind == FinanceCategoryKind.income),
      )
      .toList();

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() => _date = picked);
  }

  void _submit() {
    final accountId = _accountId;
    if (accountId == null) return;
    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) return;
    if (_type == FinanceTransactionType.transfer && (_toAccountId == null || _toAccountId == accountId)) {
      return;
    }

    Navigator.of(context).pop(
      _TransactionEditorResult(
        type: _type,
        amount: amount,
        accountId: accountId,
        toAccountId: _type == FinanceTransactionType.transfer ? _toAccountId : null,
        categoryId: _type == FinanceTransactionType.transfer ? null : _categoryId,
        date: _date,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? '新增交易' : '編輯交易'),
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
                controller: _amountController,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '金額'),
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
                      .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                      .toList(),
                  onChanged: (value) => setState(() => _categoryId = value),
                ),
              ],
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: '日期'),
                  child: Text('${_date.year}/${_date.month}/${_date.day}'),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(labelText: '備註（選填）'),
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
