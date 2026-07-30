import 'package:collection/collection.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/holiday_calendar.dart';
import '../core/models/project.dart';
import '../core/models/schedule_result.dart';
import '../core/models/work_item.dart';
import 'auth_provider.dart';
import 'edit_history.dart';

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

  static const _maxHistory = 100;
  final List<EditAction> _undoStack = [];
  final List<EditAction> _redoStack = [];

  bool get canUndo => _undoStack.isNotEmpty;
  bool get canRedo => _redoStack.isNotEmpty;

  void _record(EditAction action) {
    _undoStack.add(action);
    if (_undoStack.length > _maxHistory) _undoStack.removeAt(0);
    _redoStack.clear();
  }

  /// Undoes the most recent edit made through this notifier (rename,
  /// duration, dates, predecessors, calendar, add/delete/reorder). Replays
  /// the specific inverse mutation via the normal API-backed methods below
  /// — never a snapshot revert — so it can't clobber a change someone else
  /// just made to a different field. If the replay throws (e.g. the item
  /// no longer exists), the action is simply dropped rather than corrupting
  /// the rest of the stack; the caller's existing error handling surfaces
  /// the failure.
  Future<void> undo() async {
    if (_undoStack.isEmpty) return;
    final action = _undoStack.removeLast();
    await action.undo(this);
    _redoStack.add(action);
  }

  Future<void> redo() async {
    if (_redoStack.isEmpty) return;
    final action = _redoStack.removeLast();
    await action.redo(this);
    _undoStack.add(action);
  }

  @override
  Future<ProjectEditorState> build() => _fetch();

  Future<ProjectEditorState> _fetch() async {
    final api = ref.read(apiClientProvider);
    // One combined request instead of three separate ones — every edit in
    // the schedule tab awaits a full refresh, so this sits directly in the
    // critical path of how responsive editing feels. Running the three GETs
    // merely *concurrently* (an earlier pass at this) still left each one
    // re-doing the same project/space/membership access check from scratch
    // over its own round trip to the database; one request that checks
    // access once and fetches everything after cuts that out entirely.
    final result = await api.getProjectEditorState(projectId);
    return ProjectEditorState(project: result.project, items: result.items, schedule: result.schedule);
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

  WorkItem? _find(String id) => state.value?.items.firstWhereOrNull((i) => i.id == id);

  /// Every mutation method below applies the server's response directly to
  /// `state` instead of following up with a separate `refresh()` call — the
  /// work-item mutation endpoints already return the fresh project+items+
  /// schedule bundle in their response (see `ApiClient`'s doc comment on
  /// `createWorkItem`), so a second round trip just to re-fetch the exact
  /// same thing would double the network latency behind every single edit
  /// for no benefit.
  void _applyEditorState({
    required Project project,
    required List<WorkItem> items,
    required ScheduleResult schedule,
  }) {
    state = AsyncValue.data(ProjectEditorState(project: project, items: items, schedule: schedule));
  }

  /// Adds a new work item and returns its id (for auto-select).
  Future<String> addWorkItem({
    String name = '新工項',
    int durationDays = 1,
    String? parentId,
    bool recordHistory = true,
  }) async {
    final api = ref.read(apiClientProvider);
    final created = await api.createWorkItem(
      projectId: projectId,
      name: name,
      durationDays: durationDays,
      parentId: parentId,
    );
    _applyEditorState(project: created.project, items: created.items, schedule: created.schedule);
    if (recordHistory) _record(AddAction(created.createdId, parentId));
    return created.createdId;
  }

  /// Recreates a deleted work item from its pre-delete snapshot (used by
  /// [DeleteAction.undo]) — the recreated item gets a new server-assigned
  /// id and lands at the end of its sibling group, not its original sort
  /// position; restoring the exact position would need a further reorder
  /// call, which isn't worth the complexity for an undo path.
  Future<void> recreateWorkItem(WorkItem snapshot, {bool recordHistory = true}) async {
    final api = ref.read(apiClientProvider);
    final created = await api.createWorkItem(
      projectId: projectId,
      name: snapshot.name,
      durationDays: snapshot.durationDays,
      parentId: snapshot.parentId,
      predecessorIds: snapshot.predecessorIds.isEmpty ? null : snapshot.predecessorIds,
    );
    if (snapshot.isManuallyPinned && snapshot.manualStartDate != null) {
      final pinned = await api.updateWorkItem(
        projectId: projectId,
        workItemId: created.createdId,
        manualStartDate: snapshot.manualStartDate,
        isManuallyPinned: true,
      );
      _applyEditorState(project: pinned.project, items: pinned.items, schedule: pinned.schedule);
    } else {
      _applyEditorState(project: created.project, items: created.items, schedule: created.schedule);
    }
    if (recordHistory) _record(AddAction(created.createdId, snapshot.parentId));
  }

  Future<void> renameWorkItem(String id, String name, {bool recordHistory = true}) async {
    final oldName = _find(id)?.name;
    final result = await ref
        .read(apiClientProvider)
        .updateWorkItem(projectId: projectId, workItemId: id, name: name);
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
    if (recordHistory && oldName != null && oldName != name) {
      _record(RenameAction(id, oldName, name));
    }
  }

  Future<void> changeDuration(String id, int durationDays, {bool recordHistory = true}) async {
    final oldDuration = _find(id)?.durationDays;
    final result = await ref
        .read(apiClientProvider)
        .updateWorkItem(projectId: projectId, workItemId: id, durationDays: durationDays);
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
    if (recordHistory && oldDuration != null && oldDuration != durationDays) {
      _record(DurationAction(id, oldDuration, durationDays));
    }
  }

  /// 實際工期 — independent of the planned [changeDuration]; `days` null
  /// clears it. Not part of undo/redo history (a bookkeeping field, not a
  /// scheduling decision like the other edits here).
  Future<void> changeActualDuration(String id, int? days) async {
    final result = await ref
        .read(apiClientProvider)
        .updateWorkItem(
          projectId: projectId,
          workItemId: id,
          actualDurationDays: days,
          clearActualDurationDays: days == null,
        );
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
  }

  /// 實際開始日期 — independent of [changeStartDate]'s planned/manual pin;
  /// `date` null clears it. Same bookkeeping-not-scheduling status as
  /// [changeActualDuration] above.
  Future<void> changeActualStartDate(String id, DateTime? date) async {
    final result = await ref
        .read(apiClientProvider)
        .updateWorkItem(
          projectId: projectId,
          workItemId: id,
          actualStartDate: date,
          clearActualStartDate: date == null,
        );
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
  }

  /// `date` null clears a manual pin and reverts to the auto-computed date.
  Future<void> changeStartDate(String id, DateTime? date, {bool recordHistory = true}) async {
    final old = recordHistory ? _find(id) : null;
    final api = ref.read(apiClientProvider);
    final result = date == null
        ? await api.updateWorkItem(
            projectId: projectId,
            workItemId: id,
            clearManualStartDate: true,
            isManuallyPinned: false,
          )
        : await api.updateWorkItem(
            projectId: projectId,
            workItemId: id,
            manualStartDate: date,
            isManuallyPinned: true,
          );
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
    if (recordHistory && old != null) {
      final oldDate = old.isManuallyPinned ? old.manualStartDate : null;
      _record(StartDateAction(id, oldDate, date));
    }
  }

  Future<void> changePredecessors(
    String id,
    List<String> predecessorIds, {
    bool recordHistory = true,
  }) async {
    final oldIds = _find(id)?.predecessorIds;
    // Assigning a predecessor hands scheduling back to the auto-computed
    // date (predecessor's end + 1 working day) even if this item previously
    // had a manually pinned start date.
    final result = await ref.read(apiClientProvider).updateWorkItem(
      projectId: projectId,
      workItemId: id,
      predecessorIds: predecessorIds,
      isManuallyPinned: false,
      clearManualStartDate: true,
    );
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
    if (recordHistory && oldIds != null) {
      _record(PredecessorsAction(id, oldIds, predecessorIds));
    }
  }

  Future<void> removeWorkItem(String id, {bool recordHistory = true}) async {
    final snapshot = recordHistory ? _find(id) : null;
    final result = await ref
        .read(apiClientProvider)
        .deleteWorkItem(projectId: projectId, workItemId: id);
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
    if (recordHistory && snapshot != null) {
      _record(DeleteAction(snapshot));
    }
  }

  Future<void> reorderWorkItem(
    String draggedId,
    String targetId, {
    bool insertAfter = false,
    bool recordHistory = true,
  }) async {
    EditAction? action;
    if (recordHistory) {
      final items = state.value?.items;
      final dragged = items == null ? null : _find(draggedId);
      if (items != null && dragged != null) {
        final siblings = items.where((i) => i.parentId == dragged.parentId).toList()
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
        final index = siblings.indexWhere((i) => i.id == draggedId);
        if (index > 0) {
          action = ReorderAction(
            draggedId: draggedId,
            oldNeighborId: siblings[index - 1].id,
            oldInsertAfter: true,
            newTargetId: targetId,
            newInsertAfter: insertAfter,
          );
        } else if (index >= 0 && index < siblings.length - 1) {
          action = ReorderAction(
            draggedId: draggedId,
            oldNeighborId: siblings[index + 1].id,
            oldInsertAfter: false,
            newTargetId: targetId,
            newInsertAfter: insertAfter,
          );
        }
      }
    }
    final result = await ref.read(apiClientProvider).reorderWorkItem(
      projectId: projectId,
      workItemId: draggedId,
      targetId: targetId,
      insertAfter: insertAfter,
    );
    _applyEditorState(project: result.project, items: result.items, schedule: result.schedule);
    if (action != null) _record(action);
  }

  Future<void> updateCalendar(HolidayCalendar calendar, {bool recordHistory = true}) async {
    final oldCalendar = state.value?.project.calendar;
    await ref.read(apiClientProvider).updateCalendar(
      projectId: projectId,
      weeklyOffDays: calendar.weeklyOffDays.toList(),
      useTaiwanGovernmentCalendar: calendar.useTaiwanGovernmentCalendar,
      adHocHolidays: calendar.adHocHolidays,
      adHocWorkdays: calendar.adHocWorkdays,
    );
    await refresh();
    if (recordHistory && oldCalendar != null) {
      _record(CalendarAction(oldCalendar, calendar));
    }
  }
}

final projectEditorProvider =
    AsyncNotifierProvider.family<ProjectEditorNotifier, ProjectEditorState, String>(
      ProjectEditorNotifier.new,
    );
