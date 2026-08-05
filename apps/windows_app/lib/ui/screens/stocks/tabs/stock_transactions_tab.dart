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
class StockTransactionsTab extends ConsumerStatefulWidget {
  const StockTransactionsTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<StockTransactionsTab> createState() => _StockTransactionsTabState();
}

class _StockTransactionsTabState extends ConsumerState<StockTransactionsTab> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels < _scrollController.position.maxScrollExtent - 200) return;
    ref.read(stockTransactionsProvider(widget.spaceId).notifier).loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final spaceId = widget.spaceId;
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
              data: (page) {
                if (page.items.isEmpty) {
                  return const Center(child: Text('還沒有任何股票交易'));
                }
                return ListView.separated(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  itemCount: page.items.length + (page.hasMore ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    if (index >= page.items.length) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    final t = page.items[index];
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
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit_outlined, size: 18),
                                    onPressed: () => _openEditor(context, ref, accounts, existing: t),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline, size: 18),
                                    onPressed: () => _delete(context, ref, t),
                                  ),
                                ],
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
    ref.invalidate(stockTransactionsProvider(widget.spaceId));
    ref.invalidate(stockHoldingsProvider(widget.spaceId));
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
      await ref.read(apiClientProvider).deleteStockTransaction(spaceId: widget.spaceId, id: t.id);
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
    List<FinanceAccount> accounts, {
    StockTransaction? existing,
  }) async {
    final result = await showDialog<_StockTransactionEditorResult>(
      context: context,
      builder: (_) => _StockTransactionEditorDialog(accounts: accounts, existing: existing),
    );
    if (result == null || !context.mounted) return;

    try {
      final api = ref.read(apiClientProvider);
      if (existing == null) {
        await api.createStockTransaction(
          spaceId: widget.spaceId,
          stockCode: result.stockCode,
          type: result.type,
          pricePerShare: result.pricePerShare,
          totalCost: result.totalCost,
          tradeDate: result.tradeDate,
          accountId: result.accountId,
        );
      } else {
        await api.updateStockTransaction(
          spaceId: widget.spaceId,
          id: existing.id,
          stockCode: result.stockCode,
          pricePerShare: result.pricePerShare,
          totalCost: result.totalCost,
          tradeDate: result.tradeDate,
          accountId: result.accountId,
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
  const _StockTransactionEditorDialog({required this.accounts, this.existing});

  final List<FinanceAccount> accounts;

  /// Non-null when editing an existing (unsettled) transaction — `type`
  /// (買/賣) stays fixed, same reasoning as `StocksTransactionsService.
  /// update`'s doc comment: changing it after the fact is a bigger
  /// semantic flip than a plain field edit.
  final StockTransaction? existing;

  @override
  State<_StockTransactionEditorDialog> createState() => _StockTransactionEditorDialogState();
}

class _StockTransactionEditorDialogState extends State<_StockTransactionEditorDialog> {
  late StockTransactionType _type = widget.existing?.type ?? StockTransactionType.buy;
  late String? _accountId = widget.existing?.accountId ?? widget.accounts.firstOrNull?.id;
  late DateTime _tradeDate = widget.existing?.tradeDate ?? DateTime.now();
  late final _stockCodeController = TextEditingController(text: widget.existing?.stockCode ?? '');
  late final _priceController = TextEditingController(
    text: widget.existing == null ? '' : widget.existing!.pricePerShare.toString(),
  );
  late final _costController = TextEditingController(
    text: widget.existing == null ? '' : widget.existing!.totalCost.toString(),
  );

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
    final isEditing = widget.existing != null;
    return AlertDialog(
      title: Text(isEditing ? '編輯股票交易' : '新增股票交易'),
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
                onSelectionChanged: isEditing ? null : (selection) => setState(() => _type = selection.first),
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
