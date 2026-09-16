import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/project.dart';
import '../../../core/models/project_todo.dart' show TodoPriorityJson;
import '../../../state/my_workspace_provider.dart';

/// 個人工作站（2026-09，顧問文件橫向基礎建設 A 子項）——公司空間任何成
/// 員都能看自己的：自己是 PM 的專案（含日報/週報是否已交）、自己的工作
/// 代辦、自己待審核的材料送審。純唯讀彙總，不是新的資料輸入功能。
class MyWorkspaceScreen extends ConsumerWidget {
  const MyWorkspaceScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workspaceAsync = ref.watch(myWorkspaceProvider(spaceId));

    return Scaffold(
      appBar: AppBar(title: const Text('我的工作台')),
      body: workspaceAsync.when(
        data: (workspace) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _SectionHeader('我是 PM 的專案（${workspace.myProjects.length}）'),
            if (workspace.myProjects.isEmpty)
              const Padding(padding: EdgeInsets.only(bottom: 16), child: Text('目前沒有擔任 PM 的專案'))
            else
              for (final p in workspace.myProjects)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(p.projectName),
                    subtitle: Text(projectStageLabel(p.stage)),
                    trailing: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          p.dailyReportSubmittedToday ? '今日日報已交' : '今日日報未交',
                          style: TextStyle(
                            fontSize: 12,
                            color: p.dailyReportSubmittedToday ? Colors.green : Colors.red,
                          ),
                        ),
                        Text(
                          p.weeklyReportSubmittedThisWeek ? '本週週報已交' : '本週週報未交',
                          style: TextStyle(
                            fontSize: 12,
                            color: p.weeklyReportSubmittedThisWeek ? Colors.green : Colors.red,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            const SizedBox(height: 16),
            _SectionHeader('我的工作代辦（${workspace.myTodos.length}）'),
            if (workspace.myTodos.isEmpty)
              const Padding(padding: EdgeInsets.only(bottom: 16), child: Text('目前沒有未完成的工作代辦'))
            else
              for (final t in workspace.myTodos)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(t.title),
                    subtitle: Text(
                      [
                        if (t.projectName != null) t.projectName!,
                        if (t.dueDate != null) '截止 ${t.dueDate!.year}/${t.dueDate!.month}/${t.dueDate!.day}',
                      ].join('　'),
                    ),
                    trailing: Text(t.priority.label),
                  ),
                ),
            const SizedBox(height: 16),
            _SectionHeader('待我審核的材料送審（${workspace.myPendingReviews.length}）'),
            if (workspace.myPendingReviews.isEmpty)
              const Padding(padding: EdgeInsets.only(bottom: 16), child: Text('目前沒有待審核的材料送審'))
            else
              for (final r in workspace.myPendingReviews)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(r.materialName),
                    subtitle: Text('${r.projectName}　${r.submittedByName} 送審'),
                    trailing: Text('${r.submittedDate.year}/${r.submittedDate.month}/${r.submittedDate.day}'),
                  ),
                ),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取個人工作站失敗：$error')),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
    );
  }
}
