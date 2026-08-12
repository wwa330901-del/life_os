import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../core/models/stock.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../../../../state/stocks_provider.dart';
import '../../finance/widgets/finance_format.dart';

/// 定期定額（DCA）計畫（2026-08-12 起）— 到期時系統自動用 [monthlyAmount]
/// 先建一筆待填成交價的交易（顯示在「交易紀錄」分頁），同時發 LINE 提醒;
/// 使用者回覆「代碼 成交價」或在這裡按「登記成交」，系統用金額換算整股數,
/// 立即從帳戶扣款（不用等 T+2）。[awaitingReply] 顯示這裡讓使用者知道
/// 「提醒已經發出，正在等你登記」。
class StockRecurringTab extends ConsumerWidget {
  const StockRecurringTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plansAsync = ref.watch(stockRecurringInvestmentsProvider(spaceId));
    final accountsAsync = ref.watch(financeAccountsProvider(spaceId));
    final accounts = accountsAsync.value ?? const [];
    final accountNameOf = {for (final a in accounts) a.id: a.name};

    return Scaffold(
      floatingActionButton: accounts.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openEditor(context, ref, accounts, null),
              icon: const Icon(Icons.add),
              label: const Text('新增定期定額'),
            ),
      body: accounts.isEmpty
          ? const Center(child: Text('要先在「記帳」的「帳戶」分頁新增至少一個帳戶'))
          : plansAsync.when(
              data: (plans) {
                if (plans.isEmpty) {
                  return const Center(
                    child: Text('還沒有任何定期定額計畫\n例如每月固定日子扣款買 0050', textAlign: TextAlign.center),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  itemCount: plans.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final p = plans[index];
                    return Card(
                      child: ListTile(
                        leading: Icon(
                          Icons.savings_outlined,
                          color: p.active ? null : Theme.of(context).disabledColor,
                        ),
                        title: Text(
                          p.stockCode,
                          style: p.active ? null : TextStyle(color: Theme.of(context).disabledColor),
                        ),
                        subtitle: Text(
                          '每月 ${p.dayOfMonth} 日'
                          '${p.holidayAdjustment == FinanceRecurringHolidayAdjustment.none ? '' : '（遇假日${p.holidayAdjustment.label}）'}'
                          ' · ${p.monthlyAmount == null ? '尚未設定金額' : 'NT\$${formatAmount(p.monthlyAmount!)}'}'
                          ' · ${accountNameOf[p.accountId] ?? ''}'
                          '${p.awaitingReply ? ' · 等待回覆中' : ''}'
                          '${!p.active ? ' · 已停用' : ''}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (p.awaitingReply)
                              Padding(
                                padding: const EdgeInsets.only(right: 4),
                                child: FilledButton.tonal(
                                  onPressed: () => _openFulfillDialog(context, ref, p),
                                  child: const Text('登記成交'),
                                ),
                              ),
                            Switch(
                              value: p.active,
                              onChanged: (value) => _toggleActive(context, ref, p, value),
                            ),
                            IconButton(
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              onPressed: () => _openEditor(context, ref, accounts, p),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18),
                              onPressed: () => _delete(context, ref, p),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取定期定額失敗：$error')),
            ),
    );
  }

  void _invalidate(WidgetRef ref) {
    ref.invalidate(stockRecurringInvestmentsProvider(spaceId));
  }

  /// 登記成交也建立了一筆真的股票交易並改動持股，所以除了這個分頁本身，
  /// 交易紀錄跟持股總覽也要一起刷新（跟 `StockTransactionsTab._invalidate`
  /// 同一組 provider）。
  Future<void> _openFulfillDialog(
    BuildContext context,
    WidgetRef ref,
    StockRecurringInvestment p,
  ) async {
    final pricePerShare = await showDialog<double>(
      context: context,
      builder: (_) => _FulfillDialog(stockCode: p.stockCode, monthlyAmount: p.monthlyAmount),
    );
    if (pricePerShare == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .fulfillStockRecurringInvestment(spaceId: spaceId, id: p.id, pricePerShare: pricePerShare);
      _invalidate(ref);
      ref.invalidate(stockTransactionsProvider(spaceId));
      ref.invalidate(stockHoldingsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _toggleActive(
    BuildContext context,
    WidgetRef ref,
    StockRecurringInvestment p,
    bool active,
  ) async {
    try {
      await ref
          .read(apiClientProvider)
          .updateStockRecurringInvestment(spaceId: spaceId, id: p.id, active: active);
      _invalidate(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, StockRecurringInvestment p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除定期定額'),
        content: const Text('確定要刪除這個定期定額計畫嗎？這個動作無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteStockRecurringInvestment(spaceId: spaceId, id: p.id);
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
    StockRecurringInvestment? existing,
  ) async {
    final result = await showDialog<_StockRecurringEditorResult>(
      context: context,
      builder: (_) => _StockRecurringEditorDialog(accounts: accounts, existing: existing),
    );
    if (result == null || !context.mounted) return;

    try {
      final api = ref.read(apiClientProvider);
      if (existing == null) {
        await api.createStockRecurringInvestment(
          spaceId: spaceId,
          stockCode: result.stockCode,
          dayOfMonth: result.dayOfMonth,
          holidayAdjustment: result.holidayAdjustment,
          accountId: result.accountId,
          monthlyAmount: result.monthlyAmount,
        );
      } else {
        await api.updateStockRecurringInvestment(
          spaceId: spaceId,
          id: existing.id,
          stockCode: result.stockCode,
          dayOfMonth: result.dayOfMonth,
          holidayAdjustment: result.holidayAdjustment,
          accountId: result.accountId,
          monthlyAmount: result.monthlyAmount,
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

class _StockRecurringEditorResult {
  const _StockRecurringEditorResult({
    required this.stockCode,
    required this.dayOfMonth,
    required this.holidayAdjustment,
    required this.accountId,
    required this.monthlyAmount,
  });

  final String stockCode;
  final int dayOfMonth;
  final FinanceRecurringHolidayAdjustment holidayAdjustment;
  final String accountId;
  final double monthlyAmount;
}

class _StockRecurringEditorDialog extends StatefulWidget {
  const _StockRecurringEditorDialog({required this.accounts, this.existing});

  final List<FinanceAccount> accounts;
  final StockRecurringInvestment? existing;

  @override
  State<_StockRecurringEditorDialog> createState() => _StockRecurringEditorDialogState();
}

class _StockRecurringEditorDialogState extends State<_StockRecurringEditorDialog> {
  late String? _accountId = widget.existing?.accountId ?? widget.accounts.firstOrNull?.id;
  late DateTime _pickedDate = _initialPickedDate();
  late FinanceRecurringHolidayAdjustment _holidayAdjustment =
      widget.existing?.holidayAdjustment ?? FinanceRecurringHolidayAdjustment.none;
  late final _stockCodeController = TextEditingController(text: widget.existing?.stockCode ?? '');
  late final _amountController = TextEditingController(
    text: widget.existing?.monthlyAmount == null ? '' : widget.existing!.monthlyAmount!.toStringAsFixed(0),
  );

  DateTime _initialPickedDate() {
    final now = DateTime.now();
    final day = widget.existing?.dayOfMonth ?? now.day;
    final lastDayOfMonth = DateTime(now.year, now.month + 1, 0).day;
    return DateTime(now.year, now.month, day > lastDayOfMonth ? lastDayOfMonth : day);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _pickedDate,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) setState(() => _pickedDate = picked);
  }

  @override
  void dispose() {
    _stockCodeController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  void _submit() {
    final accountId = _accountId;
    final stockCode = _stockCodeController.text.trim();
    final monthlyAmount = double.tryParse(_amountController.text);
    if (accountId == null || stockCode.isEmpty) return;
    if (monthlyAmount == null || monthlyAmount <= 0) return;

    Navigator.of(context).pop(
      _StockRecurringEditorResult(
        stockCode: stockCode,
        dayOfMonth: _pickedDate.day,
        holidayAdjustment: _holidayAdjustment,
        accountId: accountId,
        monthlyAmount: monthlyAmount,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? '新增定期定額' : '編輯定期定額'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _stockCodeController,
                autofocus: true,
                decoration: const InputDecoration(labelText: '股票代碼', hintText: '例如 0050'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '每期投入金額', hintText: '例如 20000'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: '扣款日期',
                    helperText: '選一天，之後每月同一天提醒（超過當月天數會用當月最後一天）',
                  ),
                  child: Text('${_pickedDate.year}年${_pickedDate.month}月${_pickedDate.day}日'),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<FinanceRecurringHolidayAdjustment>(
                initialValue: _holidayAdjustment,
                decoration: const InputDecoration(labelText: '遇假日（週末或國定假日）'),
                items: FinanceRecurringHolidayAdjustment.values
                    .map((a) => DropdownMenuItem(value: a, child: Text(a.label)))
                    .toList(),
                onChanged: (value) {
                  if (value != null) setState(() => _holidayAdjustment = value);
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _accountId,
                decoration: const InputDecoration(labelText: '扣款帳戶'),
                items: widget.accounts.map((a) => DropdownMenuItem(value: a.id, child: Text(a.name))).toList(),
                onChanged: (value) => setState(() => _accountId = value),
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

/// 登記成交——跟回 LINE「代碼 成交價」問的是同一件事，只是這裡股票代碼
/// 已經知道了（來自被點的那張卡片），只需要輸入成交價，股數/金額用計畫的
/// [monthlyAmount] 自動算（無條件捨去到整股），立即從帳戶扣款。
class _FulfillDialog extends StatefulWidget {
  const _FulfillDialog({required this.stockCode, required this.monthlyAmount});

  final String stockCode;
  final double? monthlyAmount;

  @override
  State<_FulfillDialog> createState() => _FulfillDialogState();
}

class _FulfillDialogState extends State<_FulfillDialog> {
  final _priceController = TextEditingController();

  @override
  void dispose() {
    _priceController.dispose();
    super.dispose();
  }

  int? get _shares {
    final price = double.tryParse(_priceController.text);
    final amount = widget.monthlyAmount;
    if (price == null || price <= 0 || amount == null) return null;
    return (amount / price).floor();
  }

  void _submit() {
    final pricePerShare = double.tryParse(_priceController.text);
    if (pricePerShare == null || pricePerShare <= 0) return;
    Navigator.of(context).pop(pricePerShare);
  }

  @override
  Widget build(BuildContext context) {
    final shares = _shares;
    return AlertDialog(
      title: Text('登記成交 · ${widget.stockCode}'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.monthlyAmount != null) Text('目標金額 ${widget.monthlyAmount!.toStringAsFixed(0)}'),
            const SizedBox(height: 8),
            TextField(
              controller: _priceController,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: '成交價'),
              onChanged: (_) => setState(() {}),
            ),
            if (shares != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '可買 $shares 股（花費 ${((shares) * (double.tryParse(_priceController.text) ?? 0)).toStringAsFixed(0)}）',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('登記')),
      ],
    );
  }
}
