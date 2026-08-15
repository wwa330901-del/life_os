import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/project_editor_provider.dart';
import '../../shell/breadcrumb_bar.dart';
import 'tabs/engineering_finance_tab.dart';
import 'tabs/members_tab.dart';
import 'tabs/project_documents_tab.dart';
import 'tabs/project_info_tab.dart';
import 'tabs/schedule_tab.dart';

/// Project detail content — lives inside `SpaceShell`'s content pane. Five
/// tabs: 工期 (schedule), 專案資料 (per-space custom properties), 專案成員,
/// 相關文件 (document templates the project's 類型 allows), 工程財務 (工程報價單/
/// 採發比價表/成控管制表/工程請款單四表，自己再往下分頁). 代辦事項 used to
/// be a fifth tab here — moved out entirely into its own top-level 代辦事項
/// space (see `TodoShell`), since a todo can now be 個人 (no project at all)
/// as well as 工作 (this project).
class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({
    super.key,
    required this.projectId,
    required this.spaceName,
    required this.onBackToList,
  });

  final String projectId;
  final String spaceName;
  final VoidCallback onBackToList;

  static const _tabs = [
    Tab(text: '工期'),
    Tab(text: '專案資料'),
    Tab(text: '專案成員'),
    Tab(text: '相關文件'),
    Tab(text: '工程財務'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final editorAsync = ref.watch(projectEditorProvider(projectId));
    final scheme = Theme.of(context).colorScheme;

    return DefaultTabController(
      length: _tabs.length,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BreadcrumbBar(
            segments: [
              BreadcrumbSegment(spaceName, onTap: onBackToList),
              BreadcrumbSegment(editorAsync.value?.project.name ?? '專案'),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
            ),
            child: const TabBar(
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: _tabs,
            ),
          ),
          Expanded(
            child: editorAsync.when(
              data: (_) => TabBarView(
                children: [
                  ScheduleTab(projectId: projectId),
                  ProjectInfoTab(projectId: projectId),
                  MembersTab(projectId: projectId),
                  ProjectDocumentsTab(projectId: projectId),
                  EngineeringFinanceTab(projectId: projectId, spaceName: spaceName),
                ],
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取專案失敗：$error')),
            ),
          ),
        ],
      ),
    );
  }
}
