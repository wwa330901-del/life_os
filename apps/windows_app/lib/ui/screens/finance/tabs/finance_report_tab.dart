import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/finance_report.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';

const _chartPalette = [
  Color(0xFF5B8DEF),
  Color(0xFFE8743B),
  Color(0xFF2FB380),
  Color(0xFFCD5B9F),
  Color(0xFFECC94B),
  Color(0xFF9F7AEA),
  Color(0xFF48BB9F),
  Color(0xFFE53E3E),
];

/// 財務分析報表 (2026-08-06) — 淨資產/儲蓄率/分類支出佔比/投資組合/異常摘要/
/// 借貸代墊總覽/最大支出排行榜，見後端 `FinanceReportService` 的設計說明。
class FinanceReportTab extends ConsumerWidget {
  const FinanceReportTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(financeReportProvider(spaceId));

    return reportAsync.when(
      data: (report) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _NetWorthSection(netWorth: report.netWorth),
          const SizedBox(height: 24),
          _SavingsRateSection(savingsRate: report.savingsRate),
          const SizedBox(height: 24),
          _CategoryBreakdownSection(breakdown: report.categoryBreakdown, trend: report.categoryTrend),
          const SizedBox(height: 24),
          _PortfolioSection(portfolio: report.portfolio),
          const SizedBox(height: 24),
          _OverspendSection(overspend: report.overspend),
          const SizedBox(height: 24),
          _DebtsSection(debts: report.debts),
          const SizedBox(height: 24),
          _TopExpensesSection(topExpenses: report.topExpenses),
        ],
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取財務報表失敗：$error')),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
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

class _NetWorthSection extends StatelessWidget {
  const _NetWorthSection({required this.netWorth});

  final ReportNetWorth netWorth;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _SectionCard(
      title: '淨資產',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('淨資產', style: Theme.of(context).textTheme.bodySmall),
                    Text(formatAmount(netWorth.netWorth), style: Theme.of(context).textTheme.headlineMedium),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('總資產', style: Theme.of(context).textTheme.bodySmall),
                    Text(formatAmount(netWorth.totalAssets), style: TextStyle(color: Colors.green)),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('總負債', style: Theme.of(context).textTheme.bodySmall),
                    Text(formatAmount(netWorth.totalLiabilities), style: TextStyle(color: scheme.error)),
                  ],
                ),
              ),
            ],
          ),
          if (netWorth.trend.length >= 2) ...[
            const SizedBox(height: 16),
            SizedBox(height: 160, child: _NetWorthChart(trend: netWorth.trend)),
          ] else ...[
            const SizedBox(height: 8),
            Text(
              '趨勢線每天累積一筆，資料還太少（目前 ${netWorth.trend.length} 天），過幾天回來看會更完整。',
              style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
            ),
          ],
        ],
      ),
    );
  }
}

class _NetWorthChart extends StatelessWidget {
  const _NetWorthChart({required this.trend});

  final List<ReportNetWorthPoint> trend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final values = trend.map((p) => p.netWorth).toList();
    final minY = values.reduce((a, b) => a < b ? a : b);
    final maxY = values.reduce((a, b) => a > b ? a : b);
    final pad = (maxY - minY).abs() * 0.1 + 1;

    return LineChart(
      LineChartData(
        minY: minY - pad,
        maxY: maxY + pad,
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        titlesData: const FlTitlesData(
          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        lineTouchData: const LineTouchData(enabled: false),
        lineBarsData: [
          LineChartBarData(
            spots: [for (var i = 0; i < trend.length; i++) FlSpot(i.toDouble(), trend[i].netWorth)],
            isCurved: true,
            color: scheme.primary,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(show: true, color: scheme.primary.withValues(alpha: 0.12)),
          ),
        ],
      ),
    );
  }
}

class _SavingsRateSection extends StatelessWidget {
  const _SavingsRateSection({required this.savingsRate});

  final ReportSavingsRate savingsRate;

  @override
  Widget build(BuildContext context) {
    final rate = savingsRate.rate;
    return _SectionCard(
      title: '儲蓄率（${savingsRate.month}）',
      child: Row(
        children: [
          Text(
            rate == null ? '（本月沒有收入）' : '${(rate * 100).toStringAsFixed(1)}%',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const Spacer(),
          Text('收入 ${formatAmount(savingsRate.totalIncome)} － 支出 ${formatAmount(savingsRate.totalExpense)}'),
        ],
      ),
    );
  }
}

class _CategoryBreakdownSection extends StatelessWidget {
  const _CategoryBreakdownSection({required this.breakdown, required this.trend});

  final List<ReportCategoryShare> breakdown;
  final List<ReportCategoryTrendMonth> trend;

  @override
  Widget build(BuildContext context) {
    if (breakdown.isEmpty) {
      return const _SectionCard(title: '分類支出佔比', child: Text('這個月還沒有任何支出'));
    }
    final topNames = breakdown.take(3).map((c) => c.name).toList();

    return _SectionCard(
      title: '分類支出佔比',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 200,
            child: Row(
              children: [
                Expanded(
                  child: PieChart(
                    PieChartData(
                      sectionsSpace: 2,
                      centerSpaceRadius: 36,
                      sections: [
                        for (var i = 0; i < breakdown.length; i++)
                          PieChartSectionData(
                            value: breakdown[i].total,
                            color: _chartPalette[i % _chartPalette.length],
                            title: '${(breakdown[i].percentage * 100).round()}%',
                            radius: 54,
                            titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (var i = 0; i < breakdown.length; i++)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(
                              children: [
                                Container(
                                  width: 9,
                                  height: 9,
                                  decoration: BoxDecoration(
                                    color: _chartPalette[i % _chartPalette.length],
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Expanded(child: Text(breakdown[i].name, overflow: TextOverflow.ellipsis)),
                                Text(formatAmount(breakdown[i].total)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (topNames.isNotEmpty && trend.length >= 2) ...[
            const SizedBox(height: 12),
            Text('近 ${trend.length} 個月趨勢（前三大分類）', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 6),
            for (final name in topNames) _CategoryTrendRow(name: name, trend: trend),
          ],
        ],
      ),
    );
  }
}

class _CategoryTrendRow extends StatelessWidget {
  const _CategoryTrendRow({required this.name, required this.trend});

  final String name;
  final List<ReportCategoryTrendMonth> trend;

  @override
  Widget build(BuildContext context) {
    final values = trend.map((m) {
      final match = m.categories.where((c) => c.name == name).toList();
      return match.isEmpty ? 0.0 : match.first.total;
    }).toList();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(width: 70, child: Text(name, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              values.map((v) => formatAmount(v)).join('　'),
              style: const TextStyle(fontSize: 12),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _PortfolioSection extends StatelessWidget {
  const _PortfolioSection({required this.portfolio});

  final ReportPortfolio portfolio;

  @override
  Widget build(BuildContext context) {
    if (portfolio.positions.isEmpty) {
      return const _SectionCard(title: '投資組合', child: Text('目前沒有持股'));
    }
    return _SectionCard(
      title: '投資組合（總市值 ${formatAmount(portfolio.totalMarketValue)}）',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 160,
            child: PieChart(
              PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 30,
                sections: [
                  for (var i = 0; i < portfolio.positions.length; i++)
                    PieChartSectionData(
                      value: portfolio.positions[i].marketValue,
                      color: _chartPalette[i % _chartPalette.length],
                      title: '${(portfolio.positions[i].allocation * 100).round()}%',
                      radius: 44,
                      titleStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < portfolio.positions.length; i++) _PositionRow(position: portfolio.positions[i], color: _chartPalette[i % _chartPalette.length]),
        ],
      ),
    );
  }
}

class _PositionRow extends StatelessWidget {
  const _PositionRow({required this.position, required this.color});

  final ReportPosition position;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final gainColor = position.gainLoss >= 0 ? Colors.green : scheme.error;
    final annualized = position.annualizedReturn;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Expanded(
            child: Text('${position.stockName ?? position.stockCode}（${position.stockCode}）', overflow: TextOverflow.ellipsis),
          ),
          Text(formatAmount(position.marketValue)),
          const SizedBox(width: 10),
          Text(
            '${position.gainLoss >= 0 ? '+' : ''}${(position.totalReturn * 100).toStringAsFixed(1)}%',
            style: TextStyle(color: gainColor),
          ),
          if (annualized != null) ...[
            const SizedBox(width: 6),
            Text(
              '（年化 ${(annualized * 100).toStringAsFixed(1)}%）',
              style: TextStyle(fontSize: 11, color: scheme.onSurface.withValues(alpha: 0.55)),
            ),
          ],
        ],
      ),
    );
  }
}

class _OverspendSection extends StatelessWidget {
  const _OverspendSection({required this.overspend});

  final ReportOverspend overspend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final change = overspend.expenseChange;
    return _SectionCard(
      title: '異常 / 超支摘要',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            change == null
                ? '本月支出 ${formatAmount(overspend.currentMonthExpense)}（上月沒有支出可比較）'
                : '本月支出 ${formatAmount(overspend.currentMonthExpense)}，比上月${change >= 0 ? '多' : '少'} ${(change.abs() * 100).toStringAsFixed(1)}%',
          ),
          if (overspend.overBudget.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('沒有分類超出預算', style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6))),
            )
          else
            for (final b in overspend.overBudget)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, size: 16, color: scheme.error),
                    const SizedBox(width: 6),
                    Expanded(child: Text('「${b.categoryName}」超支 ${formatAmount(b.overBy)}')),
                    Text('${formatAmount(b.spent)} / ${formatAmount(b.monthlyAmount)}'),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class _DebtsSection extends StatelessWidget {
  const _DebtsSection({required this.debts});

  final ReportDebts debts;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      title: '借貸 / 代墊總覽',
      child: Row(
        children: [
          Expanded(child: _DebtStat(label: '別人欠你', value: debts.owedToMe, color: Colors.green)),
          Expanded(child: _DebtStat(label: '你欠別人', value: debts.owedByMe, color: Theme.of(context).colorScheme.error)),
          Expanded(child: _DebtStat(label: '代墊未收回', value: debts.advancesOutstanding, color: null)),
        ],
      ),
    );
  }
}

class _DebtStat extends StatelessWidget {
  const _DebtStat({required this.label, required this.value, required this.color});

  final String label;
  final double value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodySmall),
        Text(formatAmount(value), style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _TopExpensesSection extends StatelessWidget {
  const _TopExpensesSection({required this.topExpenses});

  final List<ReportTopExpense> topExpenses;

  @override
  Widget build(BuildContext context) {
    if (topExpenses.isEmpty) {
      return const _SectionCard(title: '最大支出排行榜', child: Text('這個月還沒有任何支出'));
    }
    return _SectionCard(
      title: '最大支出排行榜',
      child: Column(
        children: [
          for (var i = 0; i < topExpenses.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  SizedBox(width: 20, child: Text('${i + 1}')),
                  Expanded(
                    child: Text(
                      '${topExpenses[i].categoryName ?? '未分類'}${topExpenses[i].note != null ? ' · ${topExpenses[i].note}' : ''}',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text('${topExpenses[i].date.month}/${topExpenses[i].date.day}'),
                  const SizedBox(width: 10),
                  Text(formatAmount(topExpenses[i].amount), style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
