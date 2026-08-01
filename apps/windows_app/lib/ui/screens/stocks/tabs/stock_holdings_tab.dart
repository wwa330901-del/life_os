import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/stock.dart';
import '../../../../state/stocks_provider.dart';
import '../../finance/widgets/finance_format.dart';

/// 持股總覽 — one card per stock code, aggregated server-side from every
/// StockTransaction against it (average-cost-basis method). `currentPrice`/
/// `marketValue`/`gainLoss` are null until a price has actually been cached
/// (daily close after the first market close, or intraday during trading
/// hours) for that code.
class StockHoldingsTab extends ConsumerWidget {
  const StockHoldingsTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final holdingsAsync = ref.watch(stockHoldingsProvider(spaceId));

    return holdingsAsync.when(
      data: (holdings) {
        if (holdings.isEmpty) {
          return const Center(
            child: Text('目前沒有任何持股\n到「交易紀錄」分頁新增一筆買入即可', textAlign: TextAlign.center),
          );
        }
        final totalCostBasis = holdings.fold<double>(0, (sum, h) => sum + h.costBasis);
        final totalMarketValue = holdings
            .where((h) => h.marketValue != null)
            .fold<double>(0, (sum, h) => sum + h.marketValue!);
        final hasAnyPrice = holdings.any((h) => h.marketValue != null);

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Card(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _summaryColumn('總成本', formatAmount(totalCostBasis)),
                    _summaryColumn('目前市值', hasAnyPrice ? formatAmount(totalMarketValue) : '（無報價）'),
                    _summaryColumn(
                      '損益',
                      hasAnyPrice
                          ? '${totalMarketValue - totalCostBasis >= 0 ? '+' : ''}${formatAmount(totalMarketValue - totalCostBasis)}'
                          : '（無報價）',
                      color: !hasAnyPrice
                          ? null
                          : (totalMarketValue - totalCostBasis >= 0 ? Colors.green : Theme.of(context).colorScheme.error),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            ...holdings.map((h) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _HoldingCard(holding: h),
                )),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取持股失敗：$error')),
    );
  }

  Widget _summaryColumn(String label, String value, {Color? color}) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 12)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }
}

class _HoldingCard extends StatelessWidget {
  const _HoldingCard({required this.holding});

  final StockHolding holding;

  @override
  Widget build(BuildContext context) {
    final gainLoss = holding.gainLoss;
    final gainLossColor = gainLoss == null
        ? null
        : (gainLoss >= 0 ? Colors.green : Theme.of(context).colorScheme.error);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${holding.stockName ?? holding.stockCode}（${holding.stockCode}）',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  '${holding.shares.toStringAsFixed(2)} 股',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('均價 ${formatAmount(holding.averageCost)} · 成本 ${formatAmount(holding.costBasis)}'),
                Text(
                  holding.currentPrice != null
                      ? '現價 ${formatAmount(holding.currentPrice!)} · '
                          '${gainLoss! >= 0 ? '+' : ''}${formatAmount(gainLoss)}'
                      : '（尚無報價）',
                  style: TextStyle(color: gainLossColor, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
