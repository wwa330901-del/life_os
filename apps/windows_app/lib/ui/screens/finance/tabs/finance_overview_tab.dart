import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';
import '../widgets/finance_month_selector.dart';

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

class FinanceOverviewTab extends ConsumerStatefulWidget {
  const FinanceOverviewTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<FinanceOverviewTab> createState() => _FinanceOverviewTabState();
}

class _FinanceOverviewTabState extends ConsumerState<FinanceOverviewTab> {
  late String _month = currentMonthKey();

  @override
  Widget build(BuildContext context) {
    final query = (spaceId: widget.spaceId, month: _month);
    final summaryAsync = ref.watch(financeSummaryProvider(query));
    final budgetStatusAsync = ref.watch(financeBudgetStatusProvider(query));
    final accountsAsync = ref.watch(financeAccountsProvider(widget.spaceId));
    final trendAsync = ref.watch(financeTrendProvider(widget.spaceId));

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: () => _showLineLinkDialog(context, ref),
            icon: const Icon(Icons.chat_bubble_outline, size: 16),
            label: const Text('連結 LINE 記帳'),
          ),
        ),
        accountsAsync.when(
          data: (accounts) => accounts.isEmpty
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: _TotalAssetsCard(accounts: accounts),
                ),
          loading: () => const SizedBox.shrink(),
          error: (error, _) => Text('讀取帳戶總資產失敗：$error'),
        ),
        Center(child: FinanceMonthSelector(month: _month, onChanged: (m) => setState(() => _month = m))),
        const SizedBox(height: 16),
        summaryAsync.when(
          data: (summary) => Column(
            children: [
              _SummaryCards(summary: summary),
              const SizedBox(height: 24),
              if (summary.byCategory.where((c) => c.kind == FinanceTransactionType.expense).isNotEmpty)
                _ExpensePieChart(summary: summary),
            ],
          ),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => Text('讀取本月統計失敗：$error'),
        ),
        const SizedBox(height: 24),
        Text('近 6 個月收支趨勢', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        trendAsync.when(
          data: (trend) => _TrendChart(trend: trend),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => Text('讀取收支趨勢失敗：$error'),
        ),
        const SizedBox(height: 24),
        Text('預算進度', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        budgetStatusAsync.when(
          data: (statuses) {
            if (statuses.isEmpty) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('還沒有設定任何預算，可以到「預算」分頁設定'),
              );
            }
            return Column(
              children: [
                _BudgetTotalCard(statuses: statuses),
                const SizedBox(height: 8),
                for (final s in statuses) _BudgetProgressTile(status: s),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text('讀取預算進度失敗：$error'),
        ),
      ],
    );
  }

  Future<void> _showLineLinkDialog(BuildContext context, WidgetRef ref) async {
    try {
      final result = await ref.read(apiClientProvider).generateLineLinkCode();
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('連結 LINE 記帳'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('把這組綁定碼傳給元序記帳的 LINE 官方帳號，完成後就能直接用 LINE 傳「支出 120 午餐 現金」這樣的訊息記帳。'),
              const SizedBox(height: 16),
              Center(
                child: SelectableText(
                  result.code,
                  style: Theme.of(
                    context,
                  ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, letterSpacing: 4),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '10 分鐘內有效，過期可以重新產生一組',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

/// 總資產 — sum of every account's derived balance, across all months
/// (not scoped to the selected month like everything else on this
/// screen — "how much do I actually have right now" is always "right
/// now"). 2026-08-05 財務總覽報告改版新增：使用者原本的總覽完全看不出跨帳戶
/// 的資產全貌，只能一個一個帳戶自己加。
class _TotalAssetsCard extends StatelessWidget {
  const _TotalAssetsCard({required this.accounts});

  final List<FinanceAccount> accounts;

  @override
  Widget build(BuildContext context) {
    final total = accounts.fold<double>(0, (sum, a) => sum + a.balance);
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.primaryContainer.withValues(alpha: 0.3),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('總資產（${accounts.length} 個帳戶）', style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 4),
                  Text(formatAmount(total), style: Theme.of(context).textTheme.headlineMedium),
                ],
              ),
            ),
            Icon(Icons.account_balance_wallet_outlined, size: 32, color: scheme.primary),
          ],
        ),
      ),
    );
  }
}

/// 全部預算加總 — sits above the per-category `_BudgetProgressTile` list,
/// 2026-08-05 使用者要求「預算要有總和」新增。
class _BudgetTotalCard extends StatelessWidget {
  const _BudgetTotalCard({required this.statuses});

  final List<FinanceBudgetStatus> statuses;

  @override
  Widget build(BuildContext context) {
    final totalBudget = statuses.fold<double>(0, (sum, s) => sum + s.monthlyAmount);
    final totalSpent = statuses.fold<double>(0, (sum, s) => sum + s.spent);
    final ratio = totalBudget <= 0 ? 0.0 : (totalSpent / totalBudget).clamp(0, 1.5);
    final over = totalSpent > totalBudget;
    final scheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('全部預算', style: TextStyle(fontWeight: FontWeight.w700))),
                Text(
                  '${formatAmount(totalSpent)} / ${formatAmount(totalBudget)}',
                  style: TextStyle(color: over ? scheme.error : null, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: ratio > 1 ? 1 : ratio.toDouble(),
                minHeight: 6,
                color: over ? scheme.error : scheme.primary,
                backgroundColor: scheme.surfaceContainerHighest,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 近 6 個月收支趨勢 — grouped bar chart (income vs expense per month),
/// 2026-08-05 財務總覽報告改版新增：原本只能一次看一個月，看不出花費是在
/// 增加還是減少。
class _TrendChart extends StatelessWidget {
  const _TrendChart({required this.trend});

  final List<FinanceMonthlyTrendPoint> trend;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final maxValue = trend.fold<double>(
      0,
      (max, p) => [max, p.totalIncome, p.totalExpense].reduce((a, b) => a > b ? a : b),
    );
    final chartMax = maxValue <= 0 ? 100.0 : maxValue * 1.2;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _LegendDot(color: Colors.green, label: '收入'),
                const SizedBox(width: 16),
                _LegendDot(color: scheme.error, label: '支出'),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 220,
              child: BarChart(
                BarChartData(
                  maxY: chartMax,
                  barTouchData: BarTouchData(enabled: false),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index < 0 || index >= trend.length) return const SizedBox.shrink();
                          final month = trend[index].month.split('-').last;
                          return Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text('$month月', style: const TextStyle(fontSize: 11)),
                          );
                        },
                      ),
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  gridData: const FlGridData(show: false),
                  barGroups: [
                    for (var i = 0; i < trend.length; i++)
                      BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(toY: trend[i].totalIncome, color: Colors.green, width: 10),
                          BarChartRodData(toY: trend[i].totalExpense, color: scheme.error, width: 10),
                        ],
                        barsSpace: 4,
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}

class _SummaryCards extends StatelessWidget {
  const _SummaryCards({required this.summary});

  final FinanceMonthlySummary summary;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatCard(label: '總收入', value: summary.totalIncome, color: Colors.green)),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(label: '總支出', value: summary.totalExpense, color: Theme.of(context).colorScheme.error),
        ),
        const SizedBox(width: 12),
        Expanded(child: _StatCard(label: '淨額', value: summary.net, color: null)),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.color});

  final String label;
  final double value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 4),
            Text(
              formatAmount(value),
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: color),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExpensePieChart extends StatelessWidget {
  const _ExpensePieChart({required this.summary});

  final FinanceMonthlySummary summary;

  @override
  Widget build(BuildContext context) {
    final expenses =
        summary.byCategory.where((c) => c.kind == FinanceTransactionType.expense).toList()
          ..sort((a, b) => b.total.compareTo(a.total));
    final total = expenses.fold<double>(0, (sum, c) => sum + c.total);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('支出分類佔比', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            SizedBox(
              height: 220,
              child: Row(
                children: [
                  Expanded(
                    child: PieChart(
                      PieChartData(
                        sectionsSpace: 2,
                        centerSpaceRadius: 40,
                        sections: [
                          for (var i = 0; i < expenses.length; i++)
                            PieChartSectionData(
                              value: expenses[i].total,
                              color: _chartPalette[i % _chartPalette.length],
                              title: total == 0 ? '' : '${(expenses[i].total / total * 100).round()}%',
                              radius: 60,
                              titleStyle: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (var i = 0; i < expenses.length; i++)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: Row(
                                children: [
                                  Container(
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(
                                      color: _chartPalette[i % _chartPalette.length],
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(child: Text(expenses[i].name, overflow: TextOverflow.ellipsis)),
                                  Text(formatAmount(expenses[i].total)),
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
          ],
        ),
      ),
    );
  }
}

class _BudgetProgressTile extends StatelessWidget {
  const _BudgetProgressTile({required this.status});

  final FinanceBudgetStatus status;

  @override
  Widget build(BuildContext context) {
    final ratio = status.monthlyAmount <= 0 ? 0.0 : (status.spent / status.monthlyAmount).clamp(0, 1.5);
    final over = status.spent > status.monthlyAmount;
    final scheme = Theme.of(context).colorScheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(status.categoryName)),
                Text(
                  '${formatAmount(status.spent)} / ${formatAmount(status.monthlyAmount)}',
                  style: TextStyle(color: over ? scheme.error : null, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: ratio > 1 ? 1 : ratio.toDouble(),
                minHeight: 6,
                color: over ? scheme.error : scheme.primary,
                backgroundColor: scheme.surfaceContainerHighest,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
