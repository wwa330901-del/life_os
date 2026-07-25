import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show LogicalKeyboardKey;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/schedule_result.dart';
import '../../../../core/models/work_item_hierarchy.dart';
import '../../../../core/scheduling/working_day_calculator.dart';
import '../../../../state/export_controller.dart';
import '../../../../state/project_editor_provider.dart';
import '../../../../state/ui_prefs_provider.dart';
import '../../../widgets/projects/calendar_editor/holiday_calendar_dialog.dart';
import '../../../widgets/projects/export/export_options_dialog.dart';
import '../../../widgets/projects/gantt/gantt_timeline.dart';
import '../../../widgets/projects/gantt/linked_scroll_controllers.dart';
import '../../../widgets/projects/task_table/task_table.dart';

/// 工期 tab: an editable task list (left) next to the ported Gantt chart
/// (right), sharing vertical scroll so rows stay aligned — same split-pane
/// shape as reno_pm's project_editor_screen.dart. Dates shown always come
/// from the server's computed schedule — every edit here is a network
/// write followed by a refetch, never local arithmetic. Undo/redo
/// (Ctrl+Z/Ctrl+Y, scoped to this tab) replays inverse mutations through
/// the same API rather than reno_pm's whole-state snapshot stack — see
/// `state/edit_history.dart` for why.
class ScheduleTab extends ConsumerStatefulWidget {
  const ScheduleTab({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends ConsumerState<ScheduleTab> {
  final LinkedScrollControllers _vertical = LinkedScrollControllers();
  String? _selectedItemId;
  final Set<String> _collapsedIds = {};

  @override
  void dispose() {
    _vertical.dispose();
    super.dispose();
  }

  ProjectEditorNotifier get _notifier =>
      ref.read(projectEditorProvider(widget.projectId).notifier);

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final editorAsync = ref.watch(projectEditorProvider(widget.projectId));

    if (!editorAsync.hasValue) {
      return editorAsync.when(
        data: (_) => const SizedBox.shrink(),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取工期資料失敗：$error')),
      );
    }

    final editor = editorAsync.value!;
    final dayWidth = ref.watch(zoomDayWidthProvider);
    final flatTree = flattenTree(editor.items, collapsedIds: _collapsedIds);
    final orderedItems = flatTree.map((f) => f.item).toList();
    final issueItemIds = <String>{
      for (final issue in editor.schedule.issues) ...issue.involvedWorkItemIds,
    };
    final computedStartDates = <String, DateTime>{
      for (final entry in editor.schedule.byId.entries) entry.key: entry.value.start,
    };
    final computedEndDates = <String, DateTime>{
      for (final entry in editor.schedule.byId.entries) entry.key: entry.value.end,
    };

    void handleStartDateChanged(String id, DateTime? date) =>
        _run(() => _notifier.changeStartDate(id, date));

    void handleEndDateChanged(String id, DateTime endDate) {
      final start = computedStartDates[id] ?? editor.project.projectStartDate;
      final duration = WorkingDayCalculator.countWorkingDaysInclusive(
        start,
        endDate,
        editor.project.calendar,
      );
      _run(() => _notifier.changeDuration(id, duration < 1 ? 1 : duration));
    }

    Future<void> handleExport(String format) async {
      final exportController = ref.read(exportControllerProvider);
      bool exported;
      if (format == 'pdf') {
        final options = await PdfExportOptionsDialog.show(context);
        if (options == null || !context.mounted) return;
        exported = await exportController.exportPdf(
          project: editor.project,
          orderedItems: orderedItems,
          scheduleResult: editor.schedule,
          pageFormat: options.pageFormat,
          fillPercent: options.fillPercent,
          columns: options.columns,
        );
      } else if (format == 'compact_png') {
        final options = await CompactPngExportOptionsDialog.show(context);
        if (options == null || !context.mounted) return;
        exported = await exportController.exportCompactPng(
          project: editor.project,
          orderedItems: orderedItems,
          scheduleResult: editor.schedule,
          pixelRatio: options.pixelRatio,
          columns: options.columns,
        );
      } else {
        final options = await PngExportOptionsDialog.show(context);
        if (options == null || !context.mounted) return;
        exported = await exportController.exportPng(
          project: editor.project,
          orderedItems: orderedItems,
          scheduleResult: editor.schedule,
          pixelRatio: options.pixelRatio,
          columns: options.columns,
        );
      }
      if (!context.mounted || !exported) return;
      final formatLabel = switch (format) {
        'pdf' => 'PDF',
        'compact_png' => '小檔案 PNG',
        _ => 'PNG',
      };
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已匯出 $formatLabel')));
    }

    return CallbackShortcuts(
      bindings: {
        LogicalKeySet(LogicalKeyboardKey.control, LogicalKeyboardKey.keyZ): () =>
            _run(_notifier.undo),
        LogicalKeySet(LogicalKeyboardKey.control, LogicalKeyboardKey.keyY): () =>
            _run(_notifier.redo),
      },
      child: Focus(
        autofocus: true,
        child: Column(
      children: [
        _Toolbar(
          hasIssues: editor.schedule.hasIssues,
          issues: editor.schedule.issues,
          onCalendarSettings: () async {
            final updated = await HolidayCalendarDialog.show(context, editor.project.calendar);
            if (updated != null) {
              await _run(() => _notifier.updateCalendar(updated));
            }
          },
          onZoomIn: () => ref.read(zoomDayWidthProvider.notifier).zoomIn(),
          onZoomOut: () => ref.read(zoomDayWidthProvider.notifier).zoomOut(),
          canUndo: _notifier.canUndo,
          canRedo: _notifier.canRedo,
          onUndo: () => _run(_notifier.undo),
          onRedo: () => _run(_notifier.redo),
          onExport: handleExport,
        ),
        Expanded(
          child: orderedItems.isEmpty
              ? Center(
                  child: TextButton.icon(
                    onPressed: () async {
                      final id = await _notifier.addWorkItem();
                      setState(() => _selectedItemId = id);
                    },
                    icon: const Icon(Icons.add),
                    label: const Text('新增第一個工項'),
                  ),
                )
              : Row(
                  children: [
                    SizedBox(
                      width: 580,
                      child: TaskTable(
                        flatTree: flatTree,
                        verticalController: _vertical.first,
                        selectedItemId: _selectedItemId,
                        issueItemIds: issueItemIds,
                        computedStartDates: computedStartDates,
                        computedEndDates: computedEndDates,
                        collapsedIds: _collapsedIds,
                        onSelectItem: (id) => setState(() => _selectedItemId = id),
                        onNameChanged: (id, name) => _run(() => _notifier.renameWorkItem(id, name)),
                        onStartDateChanged: handleStartDateChanged,
                        onDurationChanged: (id, duration) =>
                            _run(() => _notifier.changeDuration(id, duration)),
                        onEndDateChanged: handleEndDateChanged,
                        onPredecessorsChanged: (id, predecessorIds) =>
                            _run(() => _notifier.changePredecessors(id, predecessorIds)),
                        onDelete: (id) {
                          _run(() => _notifier.removeWorkItem(id));
                          if (_selectedItemId == id) {
                            setState(() => _selectedItemId = null);
                          }
                        },
                        onToggleCollapse: (id) {
                          setState(() {
                            if (!_collapsedIds.add(id)) _collapsedIds.remove(id);
                          });
                        },
                        onAdd: () async {
                          final id = await _notifier.addWorkItem();
                          setState(() => _selectedItemId = id);
                        },
                        onAddChild: (parentId) async {
                          final id = await _notifier.addWorkItem(parentId: parentId);
                          setState(() => _selectedItemId = id);
                        },
                        onReorder: (draggedId, targetId, {insertAfter = false}) => _run(
                          () => _notifier.reorderWorkItem(draggedId, targetId, insertAfter: insertAfter),
                        ),
                      ),
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(
                      child: GanttTimeline(
                        orderedItems: orderedItems,
                        scheduleResult: editor.schedule,
                        calendar: editor.project.calendar,
                        projectStartDate: editor.project.projectStartDate,
                        verticalController: _vertical.second,
                        selectedItemId: _selectedItemId,
                        onSelectItem: (id) => setState(() => _selectedItemId = id),
                        dayWidth: dayWidth,
                        onItemStartDateChanged: handleStartDateChanged,
                        onItemEndDateChanged: handleEndDateChanged,
                      ),
                    ),
                  ],
                ),
        ),
      ],
        ),
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.hasIssues,
    required this.issues,
    required this.onCalendarSettings,
    required this.onZoomIn,
    required this.onZoomOut,
    required this.canUndo,
    required this.canRedo,
    required this.onUndo,
    required this.onRedo,
    required this.onExport,
  });

  final bool hasIssues;
  final List<SchedulingIssue> issues;
  final VoidCallback onCalendarSettings;
  final VoidCallback onZoomIn;
  final VoidCallback onZoomOut;
  final bool canUndo;
  final bool canRedo;
  final VoidCallback onUndo;
  final VoidCallback onRedo;
  final ValueChanged<String> onExport;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.2))),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.undo, size: 20),
            tooltip: '復原 (Ctrl+Z)',
            onPressed: canUndo ? onUndo : null,
          ),
          IconButton(
            icon: const Icon(Icons.redo, size: 20),
            tooltip: '重做 (Ctrl+Y)',
            onPressed: canRedo ? onRedo : null,
          ),
          IconButton(
            icon: const Icon(Icons.event_busy, size: 20),
            tooltip: '公休日曆設定',
            onPressed: onCalendarSettings,
          ),
          IconButton(
            icon: const Icon(Icons.zoom_out, size: 20),
            tooltip: '縮小甘特圖',
            onPressed: onZoomOut,
          ),
          IconButton(
            icon: const Icon(Icons.zoom_in, size: 20),
            tooltip: '放大甘特圖',
            onPressed: onZoomIn,
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.ios_share, size: 20),
            tooltip: '匯出',
            onSelected: onExport,
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'pdf', child: Text('匯出為 PDF')),
              PopupMenuItem(value: 'png', child: Text('匯出為圖片 (PNG)')),
              PopupMenuItem(value: 'compact_png', child: Text('匯出為圖片 (小檔案,適合傳送)')),
            ],
          ),
          if (hasIssues) ...[
            const SizedBox(width: 8),
            Tooltip(
              message: issues.map((i) => i.message).join('\n'),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.warning_amber_rounded, color: scheme.error, size: 18),
                  const SizedBox(width: 4),
                  Text('排程警告', style: TextStyle(color: scheme.error, fontSize: 12)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
