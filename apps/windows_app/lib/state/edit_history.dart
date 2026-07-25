import '../core/models/holiday_calendar.dart';
import '../core/models/work_item.dart';
import 'project_editor_provider.dart';

/// One undoable edit in a [ProjectEditorNotifier]'s history. Unlike
/// reno_pm's undo stack (which snapshots the *entire* project on every
/// change and swaps whole states back in), each action here only knows how
/// to replay the *specific* mutation it represents, through the notifier's
/// normal API-backed methods — undo is always a fresh, legitimate write
/// against whatever the server's current state is, never a wholesale
/// overwrite. That matters because life_os is multi-user: a snapshot-style
/// undo could silently clobber a change someone else just made; an
/// action-replay undo can only ever touch the same field it originally
/// changed.
///
/// Known limitation: undoing a delete recreates the work item under a new
/// server-assigned id (tracked via the mutable `_liveId` fields below so an
/// immediate redo/undo of *this same action* stays correct) — but an older
/// history entry from before the delete that still references the
/// original id will fail harmlessly (caught by the caller's existing
/// `ApiException` handling) if replayed afterward.
sealed class EditAction {
  Future<void> undo(ProjectEditorNotifier n);
  Future<void> redo(ProjectEditorNotifier n);
}

class RenameAction extends EditAction {
  RenameAction(this.id, this.oldName, this.newName);
  final String id;
  final String oldName;
  final String newName;

  @override
  Future<void> undo(ProjectEditorNotifier n) =>
      n.renameWorkItem(id, oldName, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) =>
      n.renameWorkItem(id, newName, recordHistory: false);
}

class DurationAction extends EditAction {
  DurationAction(this.id, this.oldDuration, this.newDuration);
  final String id;
  final int oldDuration;
  final int newDuration;

  @override
  Future<void> undo(ProjectEditorNotifier n) =>
      n.changeDuration(id, oldDuration, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) =>
      n.changeDuration(id, newDuration, recordHistory: false);
}

/// Covers both "pinned to a date" and "cleared back to auto" — `date ==
/// null` means auto/unpinned, matching [ProjectEditorNotifier.changeStartDate].
class StartDateAction extends EditAction {
  StartDateAction(this.id, this.oldDate, this.newDate);
  final String id;
  final DateTime? oldDate;
  final DateTime? newDate;

  @override
  Future<void> undo(ProjectEditorNotifier n) =>
      n.changeStartDate(id, oldDate, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) =>
      n.changeStartDate(id, newDate, recordHistory: false);
}

class PredecessorsAction extends EditAction {
  PredecessorsAction(this.id, this.oldIds, this.newIds);
  final String id;
  final List<String> oldIds;
  final List<String> newIds;

  @override
  Future<void> undo(ProjectEditorNotifier n) =>
      n.changePredecessors(id, oldIds, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) =>
      n.changePredecessors(id, newIds, recordHistory: false);
}

class CalendarAction extends EditAction {
  CalendarAction(this.oldCalendar, this.newCalendar);
  final HolidayCalendar oldCalendar;
  final HolidayCalendar newCalendar;

  @override
  Future<void> undo(ProjectEditorNotifier n) =>
      n.updateCalendar(oldCalendar, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) =>
      n.updateCalendar(newCalendar, recordHistory: false);
}

/// `_liveId` tracks whatever server id currently represents this item —
/// it moves each time undo/redo re-creates or re-deletes it, so an
/// immediate undo/redo/undo/redo cycle on the same action stays correct.
class AddAction extends EditAction {
  AddAction(String createdId, this.parentId) : _liveId = createdId;
  final String? parentId;
  String _liveId;

  @override
  Future<void> undo(ProjectEditorNotifier n) =>
      n.removeWorkItem(_liveId, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) async {
    _liveId = await n.addWorkItem(parentId: parentId, recordHistory: false);
  }
}

class DeleteAction extends EditAction {
  DeleteAction(this.snapshot);
  final WorkItem snapshot;

  @override
  Future<void> undo(ProjectEditorNotifier n) => n.recreateWorkItem(snapshot, recordHistory: false);
  @override
  Future<void> redo(ProjectEditorNotifier n) => n.removeWorkItem(snapshot.id, recordHistory: false);
}

class ReorderAction extends EditAction {
  ReorderAction({
    required this.draggedId,
    required this.oldNeighborId,
    required this.oldInsertAfter,
    required this.newTargetId,
    required this.newInsertAfter,
  });
  final String draggedId;
  final String oldNeighborId;
  final bool oldInsertAfter;
  final String newTargetId;
  final bool newInsertAfter;

  @override
  Future<void> undo(ProjectEditorNotifier n) => n.reorderWorkItem(
    draggedId,
    oldNeighborId,
    insertAfter: oldInsertAfter,
    recordHistory: false,
  );
  @override
  Future<void> redo(ProjectEditorNotifier n) => n.reorderWorkItem(
    draggedId,
    newTargetId,
    insertAfter: newInsertAfter,
    recordHistory: false,
  );
}
