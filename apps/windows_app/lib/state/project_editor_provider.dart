import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/holiday_calendar.dart';
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
    // Run all three GETs concurrently instead of one after another — every
    // edit in the schedule tab awaits a full refresh, so this round-trip
    // sits directly in the critical path of how responsive editing feels.
    final results = await Future.wait([
      api.getProject(projectId),
      api.listWorkItems(projectId),
      api.getSchedule(projectId),
    ]);
    return ProjectEditorState(
      project: results[0] as Project,
      items: results[1] as List<WorkItem>,
      schedule: results[2] as ScheduleResult,
    );
  }

  /// Re-fetches project + items + schedule from the server. Every mutation
  /// is followed by this instead of patching local state, since the server
  /// is the sole source of truth for computed dates. Deliberately doesn't
  /// set `state` to loading first — the previous data stays visible while
  /// this awaits, so an edit doesn't flash the screen back to a spinner.
  Future<void> refresh() async {
    try {
      final result = await _fetch();
      state = AsyncValue.data(result);
    } catch (error, stackTrace) {
      state = AsyncValue.error(error, stackTrace);
    }
  }

  /// Adds a new work item and returns its id (for auto-select).
  Future<String> addWorkItem({
    String name = '新工項',
    int durationDays = 1,
    String? parentId,
  }) async {
    final api = ref.read(apiClientProvider);
    final created = await api.createWorkItem(
      projectId: projectId,
      name: name,
      durationDays: durationDays,
      parentId: parentId,
    );
    await refresh();
    return created.id;
  }

  Future<void> renameWorkItem(String id, String name) async {
    await ref
        .read(apiClientProvider)
        .updateWorkItem(projectId: projectId, workItemId: id, name: name);
    await refresh();
  }

  Future<void> changeDuration(String id, int durationDays) async {
    await ref
        .read(apiClientProvider)
        .updateWorkItem(projectId: projectId, workItemId: id, durationDays: durationDays);
    await refresh();
  }

  /// `date` null clears a manual pin and reverts to the auto-computed date.
  Future<void> changeStartDate(String id, DateTime? date) async {
    final api = ref.read(apiClientProvider);
    if (date == null) {
      await api.updateWorkItem(
        projectId: projectId,
        workItemId: id,
        clearManualStartDate: true,
        isManuallyPinned: false,
      );
    } else {
      await api.updateWorkItem(
        projectId: projectId,
        workItemId: id,
        manualStartDate: date,
        isManuallyPinned: true,
      );
    }
    await refresh();
  }

  Future<void> changePredecessors(String id, List<String> predecessorIds) async {
    // Assigning a predecessor hands scheduling back to the auto-computed
    // date (predecessor's end + 1 working day) even if this item previously
    // had a manually pinned start date.
    await ref.read(apiClientProvider).updateWorkItem(
      projectId: projectId,
      workItemId: id,
      predecessorIds: predecessorIds,
      isManuallyPinned: false,
      clearManualStartDate: true,
    );
    await refresh();
  }

  Future<void> removeWorkItem(String id) async {
    await ref.read(apiClientProvider).deleteWorkItem(projectId: projectId, workItemId: id);
    await refresh();
  }

  Future<void> reorderWorkItem(
    String draggedId,
    String targetId, {
    bool insertAfter = false,
  }) async {
    await ref.read(apiClientProvider).reorderWorkItem(
      projectId: projectId,
      workItemId: draggedId,
      targetId: targetId,
      insertAfter: insertAfter,
    );
    await refresh();
  }

  Future<void> updateCalendar(HolidayCalendar calendar) async {
    await ref.read(apiClientProvider).updateCalendar(
      projectId: projectId,
      weeklyOffDays: calendar.weeklyOffDays.toList(),
      useTaiwanGovernmentCalendar: calendar.useTaiwanGovernmentCalendar,
      adHocHolidays: calendar.adHocHolidays,
      adHocWorkdays: calendar.adHocWorkdays,
    );
    await refresh();
  }
}

final projectEditorProvider =
    AsyncNotifierProvider.family<ProjectEditorNotifier, ProjectEditorState, String>(
      ProjectEditorNotifier.new,
    );
