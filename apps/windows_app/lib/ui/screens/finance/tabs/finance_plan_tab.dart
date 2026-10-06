import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance_plan.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';
import '../widgets/finance_plan_questions_dialog.dart';

/// 財務規劃（2026-10-02）：AI 依固定薪資、近 3 個月的收支、財務健檢和購物車，
/// 建議每月怎麼分配、各分類預算多少（可以一鍵套用）、接下來做什麼。
class FinancePlanTab extends ConsumerStatefulWidget {
  const FinancePlanTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<FinancePlanTab> createState() => _FinancePlanTabState();
}

class _FinancePlanTabState extends ConsumerState<FinancePlanTab> {
  bool _generating = false;
  bool _applying = false;

  Future<void> _generate() async {
    final container = ProviderScope.containerOf(context, listen: false);
    final api = ref.read(apiClientProvider);
    // 先問收入、固定支出、想法，再規劃。
    final FinancePlanAnswers? answers;
    try {
      final form = await api.getFinancePlanProfile(widget.spaceId);
      if (!mounted) return;
      answers = await showFinancePlanQuestionsDialog(context, form);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      return;
    }
    if (answers == null || !mounted) return;
    setState(() => _generating = true);
    try {
      await api.generateFinancePlan(widget.spaceId, answers: answers);
      container.invalidate(financePlanProvider(widget.spaceId));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Future<void> _applyBudgets() async {
    setState(() => _applying = true);
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      final applied = await ref.read(apiClientProvider).applyFinancePlanBudgets(widget.spaceId);
      container.invalidate(financeBudgetsProvider(widget.spaceId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(applied.isEmpty ? '建議的分類找不到，沒有設定預算' : '預算設好了：${applied.join('、')}')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(financePlanProvider(widget.spaceId));
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall;

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('讀取失敗：$e')),
      data: (plan) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  plan == null
                      ? '先問你每月收入、固定支出和想法，AI 再加上近 3 個月的記帳、財務健檢和購物車，建議每月怎麼分配、各分類預算多少。'
                      : '上次規劃：${plan.generatedAt.month}/${plan.generatedAt.day} ${plan.generatedAt.hour.toString().padLeft(2, '0')}:${plan.generatedAt.minute.toString().padLeft(2, '0')}',
                  style: muted,
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                onPressed: _generating ? null : _generate,
                icon: _generating
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.auto_awesome_outlined),
                label: Text(_generating ? '規劃中…' : (plan == null ? '幫我規劃' : '重新規劃')),
              ),
            ],
          ),
          if (plan != null) ...[
            const SizedBox(height: 16),
            _Section(title: '現況', child: Text(plan.summary)),
            _Section(
              title: '每月怎麼分配（月收入 ${formatAmount(plan.monthlyIncome)}）',
              child: Column(children: [for (final a in plan.allocation) _AllocationRow(item: a)]),
            ),
            if (plan.budgets.isNotEmpty)
              _Section(
                title: '建議預算',
                trailing: FilledButton.tonal(
                  onPressed: _applying ? null : _applyBudgets,
                  child: Text(_applying ? '套用中…' : '一鍵套用'),
                ),
                child: _BudgetTable(budgets: plan.budgets),
              ),
            if (plan.goals.isNotEmpty)
              _Section(
                title: '目標怎麼存',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final g in plan.goals)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${g.name}　${formatAmount(g.amount)}：每月存 ${formatAmount(g.monthlySaving)}'
                              '${g.eta == null ? '' : '，大約 ${g.eta!.substring(0, 4)} 年 ${int.parse(g.eta!.substring(5, 7))} 月達成'}',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: g.onTrack ? null : theme.colorScheme.error,
                              ),
                            ),
                            if (!g.onTrack) Text('照原本希望的時間來不及', style: TextStyle(color: theme.colorScheme.error)),
                            if (g.advice.isNotEmpty) Text(g.advice, style: muted),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            if (plan.wishlistAdvice != null) _Section(title: '購物車', child: Text(plan.wishlistAdvice!)),
            _Section(
              title: '接下來',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final (i, s) in plan.steps.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text('${i + 1}. $s'),
                    ),
                ],
              ),
            ),
            Text('在 LINE 傳「財務規劃」也可以，回「套用預算」一樣會設好。', style: muted),
          ],
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child, this.trailing});

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
                  ?trailing,
                ],
              ),
              const SizedBox(height: 12),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// 一項分配：名稱、金額、百分比，加一條比例條（單一顏色，名稱就是標籤）。
class _AllocationRow extends StatelessWidget {
  const _AllocationRow({required this.item});

  final PlanAllocation item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w600))),
              Text('${formatAmount(item.amount)}（${item.percent}%）'),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (item.percent / 100).clamp(0.0, 1.0),
              minHeight: 8,
              color: scheme.primary,
              backgroundColor: scheme.surfaceContainerHighest,
            ),
          ),
          if (item.reason.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(item.reason, style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _BudgetTable extends StatelessWidget {
  const _BudgetTable({required this.budgets});

  final List<PlanBudget> budgets;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).textTheme.bodySmall;
    return Table(
      columnWidths: const {0: FlexColumnWidth(2), 1: FlexColumnWidth(1.3), 2: FlexColumnWidth(1.3)},
      children: [
        TableRow(
          children: [
            Text('分類', style: muted),
            Text('現在平均', style: muted, textAlign: TextAlign.right),
            Text('建議預算', style: muted, textAlign: TextAlign.right),
          ],
        ),
        for (final b in budgets)
          TableRow(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.category),
                    if (b.reason.isNotEmpty) Text(b.reason, style: muted),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(b.currentAverage == null ? '—' : formatAmount(b.currentAverage!), textAlign: TextAlign.right),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(formatAmount(b.amount), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
      ],
    );
  }
}
