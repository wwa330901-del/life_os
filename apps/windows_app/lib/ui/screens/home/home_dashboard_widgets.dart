import 'package:flutter/material.dart';

import '../../../core/models/finance.dart';
import '../../../core/models/home_dashboard.dart';
import '../finance/widgets/finance_format.dart';

/// One card per configured+visible widget type — `HomePickerDashboard`
/// (in space_picker_screen.dart) looks up the right builder by type string
/// and skips anything it doesn't recognize (forward-compatible with a
/// saved layout listing a widget type from a newer release the user
/// hasn't updated to yet... though in practice this app auto-updates).
Widget? buildHomeWidget(BuildContext context, String type, HomeDashboard dashboard) {
  switch (type) {
    case 'personalFinance':
      return _PersonalFinanceCard(data: dashboard.personalFinance);
    case 'todayFinance':
      return _TodayFinanceCard(data: dashboard.personalFinance);
    case 'projectSummary':
      return _ProjectSummaryCard(projects: dashboard.projectSummary);
    case 'todayTodos':
      return _TodayTodosCard(data: dashboard.todosToday);
    default:
      return null;
  }
}

class _DashboardCard extends StatelessWidget {
  const _DashboardCard({required this.title, required this.child});

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

class _PersonalFinanceCard extends StatelessWidget {
  const _PersonalFinanceCard({required this.data});

  final HomePersonalFinance? data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _DashboardCard(
      title: '個人財務狀況',
      child: data == null
          ? const Text('還沒有個人空間')
          : data!.accounts.isEmpty
          ? const Text('還沒有任何帳戶')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final a in data!.accounts)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Expanded(child: Text(a.name)),
                        Text(
                          a.type == FinanceAccountType.creditCard && a.balance < 0
                              ? '欠款 ${formatAmount(-a.balance)}'
                              : formatAmount(a.balance),
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: a.balance < 0 ? scheme.error : null,
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

class _TodayFinanceCard extends StatelessWidget {
  const _TodayFinanceCard({required this.data});

  final HomePersonalFinance? data;

  @override
  Widget build(BuildContext context) {
    return _DashboardCard(
      title: '本日支出及收入',
      child: data == null
          ? const Text('還沒有個人空間')
          : Row(
              children: [
                Expanded(child: Text('收入：${formatAmount(data!.todayIncome)}')),
                Expanded(child: Text('支出：${formatAmount(data!.todayExpense)}')),
              ],
            ),
    );
  }
}

class _ProjectSummaryCard extends StatelessWidget {
  const _ProjectSummaryCard({required this.projects});

  final List<HomeProjectSummary> projects;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return _DashboardCard(
      title: '專案總表（今日）',
      child: projects.isEmpty
          ? const Text('今天沒有任何專案有預計或實際進行中的工項')
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final p in projects) ...[
                  Text('${p.projectName}（${p.spaceName}）', style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  if (p.plannedToday.isEmpty)
                    Text('　計畫今日應執行：（無）', style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)))
                  else
                    for (final item in p.plannedToday)
                      Text(
                        p.actualToday.any((a) => a.id == item.id)
                            ? '　計畫今日應執行：${item.name} ✓'
                            : '　計畫今日應執行：${item.name}（尚無實際紀錄，可能落後）',
                        style: TextStyle(
                          color: p.actualToday.any((a) => a.id == item.id) ? null : scheme.error,
                        ),
                      ),
                  for (final item in p.actualToday.where((a) => !p.plannedToday.any((pl) => pl.id == a.id)))
                    Text('　實際今日進行中：${item.name}（非計畫項目）'),
                  const SizedBox(height: 12),
                ],
              ],
            ),
    );
  }
}

class _TodayTodosCard extends StatelessWidget {
  const _TodayTodosCard({required this.data});

  final HomeTodosToday data;

  @override
  Widget build(BuildContext context) {
    return _DashboardCard(
      title: '本日代辦事項',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('今日已完成（${data.completedToday.length}）', style: const TextStyle(fontWeight: FontWeight.w600)),
          if (data.completedToday.isEmpty)
            const Text('（無）')
          else
            for (final t in data.completedToday) Text('・${t.title}（${t.projectName}）'),
          const SizedBox(height: 8),
          Text('今日到期未完成（${data.dueTodayIncomplete.length}）', style: const TextStyle(fontWeight: FontWeight.w600)),
          if (data.dueTodayIncomplete.isEmpty)
            const Text('（無）')
          else
            for (final t in data.dueTodayIncomplete) Text('・${t.title}（${t.projectName}）'),
        ],
      ),
    );
  }
}
