import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project.dart';
import '../core/models/schedule_result.dart';
import '../core/models/work_item.dart';
import 'auth_provider.dart';

/// Everything one open project screen needs: the project itself, its flat
/// work-item list, and the server-computed schedule. The Flutter app never
/// computes a schedule locally — it only ever displays one fetched from
/// `GET /projects/:id/schedule`, so every client stays in sync.
class ProjectEditorState {
  const ProjectEditorState({
    required this.project,
    required this.items,
    required this.schedule,
  });

  final Project project;
  final List<WorkItem> items;
  final ScheduleResult schedule;
}

class ProjectEditorNotifier extends AsyncNotifier<ProjectEditorState> {
  ProjectEditorNotifier(this.projectId);

  final String projectId;

  @override
  Future<ProjectEditorState> build() => _fetch();

  Future<ProjectEditorState> _fetch() async {
    final api = ref.read(apiClientProvider);
    final project = await api.getProject(projectId);
    final items = await api.listWorkItems(projectId);
    final schedule = await api.getSchedule(projectId);
    return ProjectEditorState(project: project, items: items, schedule: schedule);
  }

  /// Re-fetches project + items + schedule from the server. Every mutation
  /// (Phase 4) is followed by this instead of patching local state, since
  /// the server is the sole source of truth for computed dates.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_fetch);
  }
}

final projectEditorProvider =
    AsyncNotifierProvider.family<ProjectEditorNotifier, ProjectEditorState, String>(
      ProjectEditorNotifier.new,
    );
