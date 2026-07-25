import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/project_editor_provider.dart';
import '../../shell/breadcrumb_bar.dart';
import 'tabs/coming_soon_tab.dart';
import 'tabs/schedule_tab.dart';

/// Project detail content — lives inside `SpaceShell`'s content pane. Only
/// the 工期 tab has real functionality this version — the other five
/// (金額/合約條件/發包狀態/成本控制/專案成員) are navigation placeholders so the
/// shape is already in place for each to be filled in as its own slice
/// later, without redesigning this screen.
class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({
    super.key,
    required this.projectId,
    required this.spaceName,
    required this.onBackToDashboard,
    required this.onBackToList,
  });

  final String projectId;
  final String spaceName;
  final VoidCallback onBackToDashboard;
  final VoidCallback onBackToList;

  static const _tabs = [
    Tab(text: '工期'),
    Tab(text: '金額'),
    Tab(text: '合約條件'),
    Tab(text: '發包狀態'),
    Tab(text: '成本控制'),
    Tab(text: '專案成員'),
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
              BreadcrumbSegment(spaceName, onTap: onBackToDashboard),
              BreadcrumbSegment('專案管理', onTap: onBackToList),
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
                  const ComingSoonTab(label: '金額'),
                  const ComingSoonTab(label: '合約條件'),
                  const ComingSoonTab(label: '發包狀態'),
                  const ComingSoonTab(label: '成本控制'),
                  const ComingSoonTab(label: '專案成員'),
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
