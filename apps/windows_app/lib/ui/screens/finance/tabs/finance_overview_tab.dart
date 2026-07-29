import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
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
            return Column(children: [for (final s in statuses) _BudgetProgressTile(status: s)]);
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
              value.toStringAsFixed(0),
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
                                  Text(expenses[i].total.toStringAsFixed(0)),
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
                  '${status.spent.toStringAsFixed(0)} / ${status.monthlyAmount.toStringAsFixed(0)}',
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
