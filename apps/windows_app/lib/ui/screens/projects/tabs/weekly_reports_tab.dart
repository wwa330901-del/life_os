import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/weekly_report.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/weekly_reports_provider.dart';

/// 工程週報表（2026-09）— 跟日報表同一套 upsert 慣例，一個專案一週只有
/// 一筆（同一週重複送出視為覆蓋）。「本週未交週報」催辦見
/// `missingWeeklyReportsThisWeekProvider`（顯示在 `ProjectListScreen`，
/// 跨整個空間彙總，不是這裡）。
class WeeklyReportsTab extends ConsumerWidget {
  const WeeklyReportsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportsAsync = ref.watch(weeklyReportsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _submit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('填寫週報'),
      ),
      body: reportsAsync.when(
        data: (reports) {
          if (reports.isEmpty) return const Center(child: Text('這個專案還沒有任何工程週報，按右下角新增'));
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: reports.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final r = reports[index];
              final weekEnd = r.weekStartDate.add(const Duration(days: 6));
              return ListTile(
                title: Text(
                  '${r.weekStartDate.year}/${r.weekStartDate.month}/${r.weekStartDate.day} - '
                  '${weekEnd.year}/${weekEnd.month}/${weekEnd.day}',
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.summary),
                    if (r.nextWeekPlan != null && r.nextWeekPlan!.isNotEmpty) Text('下週計畫：${r.nextWeekPlan}'),
                    if (r.issues != null && r.issues!.isNotEmpty) Text('問題記錄：${r.issues}'),
                    Text(
                      '填寫人：${r.submittedByName}',
                      style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
                isThreeLine: true,
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _delete(context, ref, r),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取工程週報失敗：$error')),
      ),
    );
  }

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    final summaryController = TextEditingController();
    final nextWeekPlanController = TextEditingController();
    final issuesController = TextEditingController();
    DateTime weekAnchor = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('填寫工程週報'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('週別（任選當週一天）：${weekAnchor.year}/${weekAnchor.month}/${weekAnchor.day}')),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: weekAnchor,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => weekAnchor = picked);
                        },
                        child: const Text('選擇日期'),
                      ),
                    ],
                  ),
                  TextField(
                    controller: summaryController,
                    decoration: const InputDecoration(labelText: '本週工作摘要'),
                    maxLines: 3,
                  ),
                  TextField(
                    controller: nextWeekPlanController,
                    decoration: const InputDecoration(labelText: '下週計畫（選填）'),
                    maxLines: 2,
                  ),
                  TextField(
                    controller: issuesController,
                    decoration: const InputDecoration(labelText: '問題記錄（選填）'),
                    maxLines: 2,
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('送出')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final summary = summaryController.text.trim();
    if (summary.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請填寫本週工作摘要')));
      return;
    }

    try {
      await ref
          .read(apiClientProvider)
          .submitWeeklyReport(
            projectId: projectId,
            weekStartDate: weekAnchor,
            summary: summary,
            nextWeekPlan: nextWeekPlanController.text.trim(),
            issues: issuesController.text.trim(),
          );
      ref.invalidate(weeklyReportsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, WeeklyReport report) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除週報'),
        content: Text('確定要刪除 ${report.weekStartDate.year}/${report.weekStartDate.month}/${report.weekStartDate.day} 當週的週報嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteWeeklyReport(projectId: projectId, reportId: report.id);
      ref.invalidate(weeklyReportsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
