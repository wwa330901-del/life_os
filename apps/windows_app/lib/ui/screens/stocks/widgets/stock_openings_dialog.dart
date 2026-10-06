import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/stock.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/stocks_provider.dart';
import '../../finance/widgets/finance_format.dart';

/// 期初持股（2026-10-06）：開始記帳前就有的股票，跟帳戶的期初餘額一樣——
/// 只填股數和均價，不會從任何帳戶扣錢。之後的買賣照樣記在「交易紀錄」，
/// 持股會從期初持股接著算。
Future<void> showStockOpeningsDialog(BuildContext context, String spaceId) {
  return showDialog<void>(context: context, builder: (_) => _StockOpeningsDialog(spaceId: spaceId));
}

class _StockOpeningsDialog extends ConsumerWidget {
  const _StockOpeningsDialog({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final openingsAsync = ref.watch(stockOpeningsProvider(spaceId));
    final theme = Theme.of(context);

    return AlertDialog(
      title: const Text('期初持股'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '開始記帳前就有的股票填在這裡，跟帳戶的期初餘額一樣，不會從帳戶扣錢。之後的買賣再到「交易紀錄」新增。',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Flexible(
              child: openingsAsync.when(
                data: (openings) => openings.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Center(child: Text('還沒有期初持股')),
                      )
                    : ListView(
                        shrinkWrap: true,
                        children: openings
                            .map(
                              (o) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text('${o.stockName ?? o.stockCode}（${o.stockCode}）'),
                                subtitle: Text(
                                  '${formatShares(o.shares)} 股 · 均價 ${formatAmount(o.averageCost)} · 成本 ${formatAmount(o.totalCost)}',
                                ),
                                onTap: () => _edit(context, ref, o),
                                trailing: IconButton(
                                  tooltip: '刪除',
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _delete(context, ref, o),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                loading: () => const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (error, _) => Text('讀取失敗：$error'),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
        FilledButton.icon(
          onPressed: () => _edit(context, ref, null),
          icon: const Icon(Icons.add),
          label: const Text('新增'),
        ),
      ],
    );
  }

  void _refresh(WidgetRef ref) {
    ref.invalidate(stockOpeningsProvider(spaceId));
    ref.invalidate(stockHoldingsProvider(spaceId));
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, StockOpening? existing) async {
    final result = await showDialog<_OpeningInput>(
      context: context,
      builder: (_) => _OpeningEditor(existing: existing),
    );
    if (result == null) return;
    final api = ref.read(apiClientProvider);
    try {
      // 改代號＝換一檔：先刪舊的再存新的。
      if (existing != null && existing.stockCode != result.stockCode) {
        await api.deleteStockOpening(spaceId: spaceId, stockCode: existing.stockCode);
      }
      await api.setStockOpening(
        spaceId: spaceId,
        stockCode: result.stockCode,
        shares: result.shares,
        averageCost: result.averageCost,
      );
      _refresh(ref);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, StockOpening o) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除期初持股'),
        content: Text('確定要刪除 ${o.stockName ?? o.stockCode} 的期初持股嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteStockOpening(spaceId: spaceId, stockCode: o.stockCode);
      _refresh(ref);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

String formatShares(double shares) =>
    shares == shares.roundToDouble() ? shares.toStringAsFixed(0) : shares.toStringAsFixed(2);

class _OpeningInput {
  const _OpeningInput(this.stockCode, this.shares, this.averageCost);

  final String stockCode;
  final double shares;
  final double averageCost;
}

class _OpeningEditor extends StatefulWidget {
  const _OpeningEditor({required this.existing});

  final StockOpening? existing;

  @override
  State<_OpeningEditor> createState() => _OpeningEditorState();
}

class _OpeningEditorState extends State<_OpeningEditor> {
  late final _code = TextEditingController(text: widget.existing?.stockCode ?? '');
  late final _shares = TextEditingController(
    text: widget.existing == null ? '' : formatShares(widget.existing!.shares),
  );
  late final _average = TextEditingController(
    text: widget.existing == null ? '' : widget.existing!.averageCost.toStringAsFixed(2),
  );

  @override
  void dispose() {
    _code.dispose();
    _shares.dispose();
    _average.dispose();
    super.dispose();
  }

  double? get _total {
    final shares = double.tryParse(_shares.text);
    final average = double.tryParse(_average.text);
    if (shares == null || average == null || shares <= 0 || average < 0) return null;
    return shares * average;
  }

  void _submit() {
    final code = _code.text.trim().toUpperCase();
    final shares = double.tryParse(_shares.text);
    final average = double.tryParse(_average.text);
    if (code.isEmpty || shares == null || shares <= 0 || average == null || average < 0) return;
    Navigator.of(context).pop(_OpeningInput(code, shares, average));
  }

  @override
  Widget build(BuildContext context) {
    final total = _total;
    return AlertDialog(
      title: Text(widget.existing == null ? '新增期初持股' : '編輯期初持股'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _code,
              autofocus: true,
              decoration: const InputDecoration(labelText: '股票代碼', hintText: '例如 0050'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _shares,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: '股數', helperText: '1 張＝1000 股'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _average,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: '每股平均成本', helperText: '券商 App 上的「均價」'),
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _submit(),
            ),
            if (total != null) ...[
              const SizedBox(height: 8),
              Text('總成本 ${formatAmount(total)}（自動計算）', style: Theme.of(context).textTheme.bodySmall),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('儲存')),
      ],
    );
  }
}
