import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/project_editor_provider.dart';
import 'tabs/coming_soon_tab.dart';
import 'tabs/schedule_tab.dart';

/// Project detail: a tab container. Only the 工期 tab has real functionality
/// this version — the other five (金額/合約條件/發包狀態/成本控制/專案成員) are
/// navigation placeholders so the shape is already in place for each to be
/// filled in as its own slice later, without redesigning this screen.
class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({super.key, required this.projectId});

  final String projectId;

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

    return DefaultTabController(
      length: _tabs.length,
      child: Scaffold(
        appBar: AppBar(
          title: Text(editorAsync.value?.project.name ?? '專案'),
          bottom: const TabBar(isScrollable: true, tabs: _tabs),
        ),
        body: editorAsync.when(
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
    );
  }
}
