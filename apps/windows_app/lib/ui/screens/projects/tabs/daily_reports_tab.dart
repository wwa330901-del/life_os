import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/daily_report.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/daily_reports_provider.dart';

/// 工程日報表（2026-09）— 任何專案成員都能填，一個專案一天只有一筆（同
/// 一天重複送出視為覆蓋）。先不做照片上傳，純文字：工作內容/人力/問題
/// 記錄。「今日未交日報」催辦見 `missingDailyReportsTodayProvider`（顯示
/// 在 `ProjectListScreen`，跨整個空間彙總，不是這裡）。
class DailyReportsTab extends ConsumerWidget {
  const DailyReportsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportsAsync = ref.watch(dailyReportsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _submit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('填寫日報'),
      ),
      body: reportsAsync.when(
        data: (reports) {
          if (reports.isEmpty) return const Center(child: Text('這個專案還沒有任何工程日報，按右下角新增'));
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: reports.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final r = reports[index];
              return ListTile(
                title: Text('${r.reportDate.year}/${r.reportDate.month}/${r.reportDate.day}'),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.workContent),
                    if (r.manpower != null) Text('人力：${r.manpower}'),
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
        error: (error, _) => Center(child: Text('讀取工程日報失敗：$error')),
      ),
    );
  }

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    final workContentController = TextEditingController();
    final manpowerController = TextEditingController();
    final issuesController = TextEditingController();
    DateTime reportDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('填寫工程日報'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('日期：${reportDate.year}/${reportDate.month}/${reportDate.day}')),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: reportDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => reportDate = picked);
                        },
                        child: const Text('選擇日期'),
                      ),
                    ],
                  ),
                  TextField(
                    controller: workContentController,
                    decoration: const InputDecoration(labelText: '今日工作內容'),
                    maxLines: 3,
                  ),
                  TextField(
                    controller: manpowerController,
                    decoration: const InputDecoration(labelText: '今日人力（選填）'),
                    keyboardType: TextInputType.number,
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

    final workContent = workContentController.text.trim();
    if (workContent.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請填寫今日工作內容')));
      return;
    }

    try {
      await ref
          .read(apiClientProvider)
          .submitDailyReport(
            projectId: projectId,
            reportDate: reportDate,
            workContent: workContent,
            manpower: int.tryParse(manpowerController.text.trim()),
            issues: issuesController.text.trim(),
          );
      ref.invalidate(dailyReportsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, DailyReport report) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除日報'),
        content: Text('確定要刪除 ${report.reportDate.year}/${report.reportDate.month}/${report.reportDate.day} 的日報嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteDailyReport(projectId: projectId, reportId: report.id);
      ref.invalidate(dailyReportsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
