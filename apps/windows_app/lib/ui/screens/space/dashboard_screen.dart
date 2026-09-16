import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/dashboard.dart';
import '../../../state/dashboard_provider.dart';
import '../finance/widgets/finance_format.dart';

/// 監控儀表板（2026-09，顧問文件唯一整個模組空白的項目）——四種角色視角
/// 對應四個分頁，純數字/清單卡片呈現，不做互動圖表（避免不必要的圖表套
/// 件依賴）。只有 OWNER/ADMIN/總經理能看，側邊欄入口本身也只對
/// OWNER/ADMIN 顯示（見 `app_sidebar.dart`）——總經理如果剛好是一般
/// MEMBER，目前還看不到入口，這是已知的簡化，之後有需要再補。
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('監控儀表板'),
          bottom: const TabBar(
            tabs: [
              Tab(text: '總經理視角'),
              Tab(text: '部門視角'),
              Tab(text: '專案視角'),
              Tab(text: '數據分析'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _GeneralManagerTab(spaceId: spaceId),
            _DepartmentTab(spaceId: spaceId),
            _ProjectTab(spaceId: spaceId),
            _DataAnalysisTab(spaceId: spaceId),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 8),
            Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _GeneralManagerTab extends ConsumerWidget {
  const _GeneralManagerTab({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(spaceDashboardProvider(spaceId));
    return dashboardAsync.when(
      data: (dashboard) {
        final view = dashboard.generalManagerView;
        if (view == null) return const Center(child: Text('這個區塊目前算不出來，稍後再試'));
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _StatCard(label: '今日未交日報專案數', value: '${view.missingDailyReportProjectCount}'),
                _StatCard(label: '待審核材料送審', value: '${view.pendingMaterialSubmissionCount}'),
                _StatCard(label: '近 30 天異動筆數', value: '${view.recentFieldChangeCount}'),
              ],
            ),
            const SizedBox(height: 16),
            Text('全公司專案數（依階段）', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final entry in orderedStageCounts(view.projectCountByStage))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(child: Text(dashboardStageLabel(entry.key))),
                    Text('${entry.value}'),
                  ],
                ),
              ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取失敗：$error')),
    );
  }
}

class _DepartmentTab extends ConsumerWidget {
  const _DepartmentTab({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(spaceDashboardProvider(spaceId));
    return dashboardAsync.when(
      data: (dashboard) {
        final view = dashboard.departmentView;
        if (view == null) return const Center(child: Text('這個區塊目前算不出來，稍後再試'));
        if (view.isEmpty) return const Center(child: Text('這個空間還沒有建立任何部門'));
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: view.length,
          separatorBuilder: (_, _) => const Divider(),
          itemBuilder: (context, index) {
            final d = view[index];
            return ListTile(
              title: Text(d.departmentName),
              subtitle: Text('成員 ${d.memberCount} 人'),
              trailing: Text('擔任 PM 的專案 ${d.pmProjectCount} 個'),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取失敗：$error')),
    );
  }
}

class _ProjectTab extends ConsumerWidget {
  const _ProjectTab({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(spaceDashboardProvider(spaceId));
    return dashboardAsync.when(
      data: (dashboard) {
        final view = dashboard.projectView;
        if (view == null) return const Center(child: Text('這個區塊目前算不出來，稍後再試'));
        if (view.isEmpty) return const Center(child: Text('這個空間還沒有任何專案'));
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: view.length,
          separatorBuilder: (_, _) => const Divider(),
          itemBuilder: (context, index) {
            final p = view[index];
            return ListTile(
              title: Text(p.projectName),
              subtitle: Text(
                '${dashboardStageLabel(p.stage)}　${dashboardCaseTypeLabel(p.caseType)}　'
                'PM：${p.pmName ?? '未指派'}',
              ),
              trailing: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    p.dailyReportSubmittedToday ? '日報已交' : '日報未交',
                    style: TextStyle(fontSize: 12, color: p.dailyReportSubmittedToday ? Colors.green : Colors.red),
                  ),
                  Text(
                    p.weeklyReportSubmittedThisWeek ? '週報已交' : '週報未交',
                    style: TextStyle(fontSize: 12, color: p.weeklyReportSubmittedThisWeek ? Colors.green : Colors.red),
                  ),
                ],
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取失敗：$error')),
    );
  }
}

class _DataAnalysisTab extends ConsumerWidget {
  const _DataAnalysisTab({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(spaceDashboardProvider(spaceId));
    return dashboardAsync.when(
      data: (dashboard) {
        final view = dashboard.dataAnalysisView;
        if (view == null) return const Center(child: Text('這個區塊目前算不出來，稍後再試'));
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _StatCard(label: '全公司報價單總額', value: formatAmount(view.totalQuotationGrandTotal)),
                _StatCard(label: '業主估驗計價總額', value: formatAmount(view.totalOwnerBillingAmount)),
                _StatCard(label: '對廠商請款總額', value: formatAmount(view.totalPaymentRequestAmount)),
                _StatCard(label: '應收未收餘額', value: formatAmount(view.totalReceivableOutstanding)),
                _StatCard(label: '應付未付餘額', value: formatAmount(view.totalPayableOutstanding)),
              ],
            ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取失敗：$error')),
    );
  }
}
