import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/project_editor_provider.dart';
import '../../shell/breadcrumb_bar.dart';
import 'tabs/members_tab.dart';
import 'tabs/project_info_tab.dart';
import 'tabs/schedule_tab.dart';

/// Project detail content — lives inside `SpaceShell`'s content pane.
/// Three tabs, all with real functionality: 工期 (schedule), 專案資料
/// (type/status/client/site/case number), 專案成員. The four business
/// modules planned for later (金額/合約條件/發包狀態/成本控制) don't have a
/// placeholder here anymore — an empty "coming soon" tab wasn't earning its
/// spot in the tab bar; they'll get added back once each has real content.
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

  static const _tabs = [Tab(text: '工期'), Tab(text: '專案資料'), Tab(text: '專案成員')];

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
