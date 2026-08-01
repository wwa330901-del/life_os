import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../core/models/stock.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../../../../state/stocks_provider.dart';
import '../../finance/widgets/finance_format.dart';

/// 交易紀錄 — every manually-entered (or LINE 定期定額 fill-in) stock
/// buy/sell. [pricePerShare]／[totalCost] are what the user actually types;
/// 股數 is always server-derived and shown read-only. Settlement (T+2) is
/// automatic — this tab just shows whether it's happened yet.
class StockTransactionsTab extends ConsumerWidget {
  const StockTransactionsTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transactionsAsync = ref.watch(stockTransactionsProvider(spaceId));
    final accountsAsync = ref.watch(financeAccountsProvider(spaceId));
    final accounts = accountsAsync.value ?? const [];
    final accountNameOf = {for (final a in accounts) a.id: a.name};

    return Scaffold(
      floatingActionButton: accounts.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openEditor(context, ref, accounts),
              icon: const Icon(Icons.add),
              label: const Text('新增交易'),
            ),
      body: accounts.isEmpty
          ? const Center(child: Text('要先在「記帳」的「帳戶」分頁新增至少一個帳戶'))
          : transactionsAsync.when(
              data: (transactions) {
                if (transactions.isEmpty) {
                  return const Center(child: Text('還沒有任何股票交易'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  itemCount: transactions.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final t = transactions[index];
                    return Card(
                      child: ListTile(
                        leading: Icon(
                          t.type == StockTransactionType.buy ? Icons.arrow_upward : Icons.arrow_downward,
                          color: t.type == StockTransactionType.buy ? Theme.of(context).colorScheme.error : Colors.green,
                        ),
                        title: Text('${t.type.label} ${t.stockCode} · ${t.shares.toStringAsFixed(2)} 股'),
                        subtitle: Text(
                          '成交價 ${formatAmount(t.pricePerShare)} · 投入 ${formatAmount(t.totalCost)} · '
                          '${accountNameOf[t.accountId] ?? ''}\n'
                          '成交 ${t.tradeDate.month}/${t.tradeDate.day} → 交割 ${t.settlementDate.month}/${t.settlementDate.day}'
                          '${t.settled ? '（已交割）' : '（未交割）'}',
                        ),
                        isThreeLine: true,
                        trailing: t.settled
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.delete_outline, size: 18),
                                onPressed: () => _delete(context, ref, t),
                              ),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取股票交易失敗：$error')),
            ),
    );
  }

  void _invalidate(WidgetRef ref) {
    ref.invalidate(stockTransactionsProvider(spaceId));
    ref.invalidate(stockHoldingsProvider(spaceId));
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, StockTransaction t) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除股票交易'),
        content: const Text('確定要刪除這筆股票交易嗎？這個動作無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteStockTransaction(spaceId: spaceId, id: t.id);
      _invalidate(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditor(BuildContext context, WidgetRef ref, List<FinanceAccount> accounts) async {
    final result = await showDialog<_StockTransactionEditorResult>(
      context: context,
      builder: (_) => _StockTransactionEditorDialog(accounts: accounts),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).createStockTransaction(
            spaceId: spaceId,
            stockCode: result.stockCode,
            type: result.type,
            pricePerShare: result.pricePerShare,
            totalCost: result.totalCost,
            tradeDate: result.tradeDate,
            accountId: result.accountId,
          );
      _invalidate(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _StockTransactionEditorResult {
  const _StockTransactionEditorResult({
    required this.stockCode,
    required this.type,
    required this.pricePerShare,
    required this.totalCost,
    required this.tradeDate,
    required this.accountId,
  });

  final String stockCode;
  final StockTransactionType type;
  final double pricePerShare;
  final double totalCost;
  final DateTime tradeDate;
  final String accountId;
}

class _StockTransactionEditorDialog extends StatefulWidget {
  const _StockTransactionEditorDialog({required this.accounts});

  final List<FinanceAccount> accounts;

  @override
  State<_StockTransactionEditorDialog> createState() => _StockTransactionEditorDialogState();
}

class _StockTransactionEditorDialogState extends State<_StockTransactionEditorDialog> {
  StockTransactionType _type = StockTransactionType.buy;
  late String? _accountId = widget.accounts.firstOrNull?.id;
  DateTime _tradeDate = DateTime.now();
  final _stockCodeController = TextEditingController();
  final _priceController = TextEditingController();
  final _costController = TextEditingController();

  @override
  void dispose() {
    _stockCodeController.dispose();
    _priceController.dispose();
    _costController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _tradeDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() => _tradeDate = picked);
  }

  double? get _shares {
    final price = double.tryParse(_priceController.text);
    final cost = double.tryParse(_costController.text);
    if (price == null || cost == null || price <= 0) return null;
    return cost / price;
  }

  void _submit() {
    final accountId = _accountId;
    final stockCode = _stockCodeController.text.trim();
    final pricePerShare = double.tryParse(_priceController.text);
    final totalCost = double.tryParse(_costController.text);
    if (accountId == null || stockCode.isEmpty) return;
    if (pricePerShare == null || pricePerShare <= 0) return;
    if (totalCost == null || totalCost <= 0) return;

    Navigator.of(context).pop(
      _StockTransactionEditorResult(
        stockCode: stockCode,
        type: _type,
        pricePerShare: pricePerShare,
        totalCost: totalCost,
        tradeDate: _tradeDate,
        accountId: accountId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shares = _shares;
    return AlertDialog(
      title: const Text('新增股票交易'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<StockTransactionType>(
                segments: const [
                  ButtonSegment(value: StockTransactionType.buy, label: Text('買入')),
                  ButtonSegment(value: StockTransactionType.sell, label: Text('賣出')),
                ],
                selected: {_type},
                onSelectionChanged: (selection) => setState(() => _type = selection.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _stockCodeController,
                autofocus: true,
                decoration: const InputDecoration(labelText: '股票代碼', hintText: '例如 0050'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _priceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '成交價（每股）'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _costController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '投入成本（總金額）'),
                onChanged: (_) => setState(() {}),
              ),
              if (shares != null) ...[
                const SizedBox(height: 8),
                Text('約 ${shares.toStringAsFixed(2)} 股（自動計算）', style: Theme.of(context).textTheme.bodySmall),
              ],
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _accountId,
                decoration: const InputDecoration(labelText: '帳戶'),
                items: widget.accounts.map((a) => DropdownMenuItem(value: a.id, child: Text(a.name))).toList(),
                onChanged: (value) => setState(() => _accountId = value),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: '成交日', helperText: 'T+2 交割日會自動算出'),
                  child: Text('${_tradeDate.year}/${_tradeDate.month}/${_tradeDate.day}'),
                ),
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
