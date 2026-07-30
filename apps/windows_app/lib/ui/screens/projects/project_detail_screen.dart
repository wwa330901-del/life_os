import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/project_editor_provider.dart';
import '../../shell/breadcrumb_bar.dart';
import 'tabs/members_tab.dart';
import 'tabs/project_documents_tab.dart';
import 'tabs/project_info_tab.dart';
import 'tabs/project_todos_tab.dart';
import 'tabs/schedule_tab.dart';

/// Project detail content — lives inside `SpaceShell`'s content pane.
/// Five tabs, all with real functionality: 工期 (schedule), 專案資料
/// (per-space custom properties), 專案成員, 相關文件 (document templates the
/// project's 類型 allows), 代辦事項 (plain tasks, no duration).
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
    Tab(text: '代辦事項'),
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
                  ProjectTodosTab(projectId: projectId),
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
