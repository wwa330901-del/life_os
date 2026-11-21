import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../core/models/home_dashboard.dart';
import '../finance/widgets/finance_format.dart';

/// 首頁統計小工具（預算進度、財務健檢＋淨資產走勢、每月固定的扣款狀態）。
class _StatCard extends StatelessWidget {
  const _StatCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

const _noData = Text('暫時沒有資料');

String _md(DateTime d) => '${d.month}/${d.day}';

class BudgetProgressCard extends StatelessWidget {
  const BudgetProgressCard({super.key, required this.data});

  final HomeBudgetProgress? data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final items = data?.items ?? const <HomeBudgetItem>[];
    return _StatCard(
      title: '預算進度',
      child: data == null
          ? _noData
          : items.isEmpty
          ? const Text('還沒有設預算，可以到記帳的「預算」設定')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final b in items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(b.categoryName)),
                            Text(
                              '${formatAmount(b.spent)} / ${formatAmount(b.budget)}',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: b.ratio > 1
                                    ? scheme.error
                                    : b.ratio >= 0.8
                                    ? Colors.orange.shade800
                                    : null,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: b.ratio.clamp(0, 1).toDouble(),
                            minHeight: 8,
                            color: b.ratio > 1
                                ? scheme.error
                                : b.ratio >= 0.8
                                ? Colors.orange.shade700
                                : scheme.primary,
                            backgroundColor: scheme.surfaceContainerHighest,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}

class FinancialHealthCard extends StatelessWidget {
  const FinancialHealthCard({super.key, required this.data});

  final HomeFinancialHealth? data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final d = data;
    return _StatCard(
      title: '財務健檢＋淨資產走勢',
      child: d == null
          ? _noData
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      d.score.round().toString(),
                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, height: 1),
                    ),
                    const SizedBox(width: 4),
                    const Text('分'),
                    const SizedBox(width: 12),
                    if (d.grade.isNotEmpty) Text(d.grade, style: TextStyle(color: scheme.onSurfaceVariant)),
                    const Spacer(),
                    if (d.netWorth != null)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('淨資產', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                          Text(formatAmount(d.netWorth!), style: const TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                if (d.trend.length < 2)
                  Text('淨資產走勢要記滿兩週才畫得出來', style: TextStyle(color: scheme.onSurfaceVariant))
                else
                  SizedBox(
                    height: 90,
                    child: Semantics(
                      label: '最近半年淨資產走勢，從 ${formatAmount(d.trend.first.netWorth)} 到 ${formatAmount(d.trend.last.netWorth)}',
                      child: LineChart(
                        LineChartData(
                          gridData: const FlGridData(show: false),
                          borderData: FlBorderData(show: false),
                          titlesData: const FlTitlesData(show: false),
                          lineTouchData: LineTouchData(
                            touchTooltipData: LineTouchTooltipData(
                              getTooltipItems: (spots) => [
                                for (final s in spots)
                                  LineTooltipItem(
                                    '${_md(d.trend[s.x.toInt()].date)}\n${formatAmount(s.y)}',
                                    TextStyle(color: scheme.onInverseSurface, fontSize: 12),
                                  ),
                              ],
                            ),
                          ),
                          lineBarsData: [
                            LineChartBarData(
                              spots: [for (var i = 0; i < d.trend.length; i++) FlSpot(i.toDouble(), d.trend[i].netWorth)],
                              isCurved: true,
                              color: scheme.primary,
                              barWidth: 2,
                              dotData: const FlDotData(show: false),
                              belowBarData: BarAreaData(show: true, color: scheme.primary.withValues(alpha: 0.12)),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class RecurringStatusCard extends StatelessWidget {
  const RecurringStatusCard({super.key, required this.data});

  final HomeRecurringStatus? data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final d = data;
    return _StatCard(
      title: '每月固定的扣款狀態',
      child: d == null
          ? _noData
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (d.items.isEmpty) const Text('還沒有設定每月固定的收支'),
                for (final r in d.items)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            [
                              r.label,
                              if (r.amount != null) formatAmount(r.amount!),
                              r.accountName,
                            ].join('・'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _StatusChip(
                          text: r.firedThisMonth
                              ? '✓ ${_md(r.thisMonthDate)} ${r.amount == null ? '已提醒' : '已自動記帳'}'
                              : '這個月還沒到',
                          done: r.firedThisMonth,
                        ),
                        const SizedBox(width: 8),
                        Text('下次 ${_md(r.nextDate)}', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                if (d.recentReconciliations.isNotEmpty) ...[
                  const Divider(height: 24),
                  Text('最近平帳', style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  for (final x in d.recentReconciliations)
                    Text(
                      '${_md(x.date)}・${x.accountName}・${x.difference < 0 ? '忘記記 ${formatAmount(-x.difference)}' : '多出 ${formatAmount(x.difference)}'}',
                    ),
                ],
              ],
            ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.text, required this.done});

  final String text;
  final bool done;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: done ? scheme.primaryContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, color: done ? scheme.onPrimaryContainer : scheme.onSurfaceVariant),
      ),
    );
  }
}
