import 'package:flutter/gestures.dart' show DragStartBehavior;
import 'package:flutter/material.dart';

import '../../../../core/models/holiday_calendar.dart';
import '../../../../core/models/schedule_result.dart';
import '../../../../core/models/work_item.dart';
import '../../../../core/models/work_item_hierarchy.dart';
import '../../../../core/scheduling/gantt_date_range.dart';
import 'gantt_colors.dart';
import 'gantt_header_painter.dart';
import 'gantt_layout.dart';
import 'gantt_painter.dart';
import 'linked_scroll_controllers.dart';

const _resizeHandleWidth = 8.0;

/// Right-hand pane: a horizontally-scrollable date ruler + bar canvas. Its
/// vertical scroll is driven by [verticalController], which the caller also
/// attaches to the left-hand task list so both panes stay row-aligned.
/// Ported from reno_pm's gantt_timeline.dart, plus a life_os-only addition:
/// dragging a bar directly on the canvas to reschedule it or change its
/// duration (reno_pm never had this — it only ever exposed dates via the
/// task table's pickers).
class GanttTimeline extends StatefulWidget {
  final List<WorkItem> orderedItems;
  final ScheduleResult scheduleResult;
  final HolidayCalendar calendar;
  final DateTime projectStartDate;
  final ScrollController verticalController;
  final String? selectedItemId;
  final ValueChanged<String>? onSelectItem;
  final double dayWidth;

  /// Bar body dragged left/right — same semantics as manually picking a new
  /// start date in the task table (pins it). Null disables bar dragging.
  final void Function(String id, DateTime newStartDate)? onItemStartDateChanged;

  /// Bar's right edge dragged to change its length — same semantics as
  /// picking a new end date in the task table (duration is re-derived from
  /// the working-day calendar by the caller). Null disables the resize
  /// handle.
  final void Function(String id, DateTime newEndDate)? onItemEndDateChanged;

  const GanttTimeline({
    super.key,
    required this.orderedItems,
    required this.scheduleResult,
    required this.calendar,
    required this.projectStartDate,
    required this.verticalController,
    this.selectedItemId,
    this.onSelectItem,
    this.onItemStartDateChanged,
    this.onItemEndDateChanged,
    this.dayWidth = GanttLayout.dayWidth,
  });

  @override
  State<GanttTimeline> createState() => _GanttTimelineState();
}

class _GanttTimelineState extends State<GanttTimeline> {
  // The date ruler and the bar canvas below it are separate `Scrollable`s
  // (the ruler stays fixed while only the body scrolls vertically), so
  // dragging either one horizontally needs to be mirrored onto the other
  // explicitly — see `LinkedScrollControllers`.
  final LinkedScrollControllers _horizontal = LinkedScrollControllers();

  String? _dragItemId;
  bool _dragIsResize = false;
  int _dragDayOffset = 0;
  double _dragCumulativeDx = 0;

  @override
  void dispose() {
    _horizontal.dispose();
    super.dispose();
  }

  double _xForDate(DateTime date, DateTime timelineStart) =>
      date.difference(timelineStart).inDays * widget.dayWidth;

  void _startDrag(String itemId, {required bool isResize}) {
    setState(() {
      _dragItemId = itemId;
      _dragIsResize = isResize;
      _dragDayOffset = 0;
      _dragCumulativeDx = 0;
    });
  }

  void _updateDrag(double deltaDx) {
    _dragCumulativeDx += deltaDx;
    final offset = (_dragCumulativeDx / widget.dayWidth).round();
    if (offset != _dragDayOffset) {
      setState(() => _dragDayOffset = offset);
    }
  }

  void _endDrag(WorkItem item, ScheduledTask scheduled) {
    final offset = _dragDayOffset;
    final wasResize = _dragIsResize;
    setState(() {
      _dragItemId = null;
      _dragDayOffset = 0;
      _dragCumulativeDx = 0;
    });
    if (offset == 0) return;
    if (wasResize) {
      final newEnd = scheduled.end.add(Duration(days: offset));
      if (!newEnd.isBefore(scheduled.start)) {
        widget.onItemEndDateChanged?.call(item.id, newEnd);
      }
    } else {
      widget.onItemStartDateChanged?.call(item.id, scheduled.start.add(Duration(days: offset)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final range = computeGanttDateRange(
      projectStartDate: widget.projectStartDate,
      scheduleResult: widget.scheduleResult,
    );
    final totalWidth = range.dayCount * widget.dayWidth;
    final totalHeight = widget.orderedItems.length * GanttLayout.rowHeight;
    final colors = GanttColors.fromScheme(Theme.of(context).colorScheme);
    final parentIds = parentItemIds(widget.orderedItems);
    final canDragBars =
        widget.onItemStartDateChanged != null && widget.onItemEndDateChanged != null;

    return Column(
      children: [
        SizedBox(
          height: GanttLayout.headerHeight,
          child: SingleChildScrollView(
            controller: _horizontal.first,
            scrollDirection: Axis.horizontal,
            physics: const ClampingScrollPhysics(),
            child: CustomPaint(
              size: Size(totalWidth, GanttLayout.headerHeight),
              painter: GanttHeaderPainter(
                timelineStart: range.start,
                dayCount: range.dayCount,
                dayWidth: widget.dayWidth,
                calendar: widget.calendar,
                colors: colors,
              ),
            ),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            controller: widget.verticalController,
            scrollDirection: Axis.vertical,
            child: Scrollbar(
              controller: _horizontal.second,
              thumbVisibility: true,
              child: SingleChildScrollView(
                controller: _horizontal.second,
                scrollDirection: Axis.horizontal,
                physics: const ClampingScrollPhysics(),
                child: Stack(
                  children: [
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTapUp: (details) {
                        if (widget.onSelectItem == null) return;
                        final row = (details.localPosition.dy / GanttLayout.rowHeight).floor();
                        if (row >= 0 && row < widget.orderedItems.length) {
                          widget.onSelectItem!(widget.orderedItems[row].id);
                        }
                      },
                      child: CustomPaint(
                        size: Size(totalWidth, totalHeight),
                        painter: GanttPainter(
                          orderedItems: widget.orderedItems,
                          scheduleResult: widget.scheduleResult,
                          calendar: widget.calendar,
                          timelineStart: range.start,
                          dayCount: range.dayCount,
                          today: DateTime.now(),
                          selectedItemId: widget.selectedItemId,
                          dayWidth: widget.dayWidth,
                          colors: colors,
                          dragPreview: _dragItemId == null
                              ? null
                              : (
                                  itemId: _dragItemId!,
                                  dayOffset: _dragDayOffset,
                                  isResize: _dragIsResize,
                                ),
                        ),
                      ),
                    ),
                    if (canDragBars)
                      for (var i = 0; i < widget.orderedItems.length; i++)
                        ..._barDragOverlays(i, range.start, parentIds),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// The draggable regions for one row's bar — a "move" strip over most of
  /// the bar and a narrower "resize" handle over its right edge. Summary
  /// rows and items the scheduler excluded (dependency cycles) get none:
  /// their dates aren't something a single item owns.
  List<Widget> _barDragOverlays(int row, DateTime timelineStart, Set<String> parentIds) {
    final item = widget.orderedItems[row];
    if (parentIds.contains(item.id)) return const [];
    final scheduled = widget.scheduleResult.byId[item.id];
    if (scheduled == null) return const [];

    final left = _xForDate(scheduled.start, timelineStart);
    final right = _xForDate(scheduled.end.add(const Duration(days: 1)), timelineStart);
    final top = row * GanttLayout.rowHeight + GanttLayout.barVerticalPadding;
    final height = GanttLayout.rowHeight - GanttLayout.barVerticalPadding * 2;
    final width = right - left;
    final canResize = width > _resizeHandleWidth * 2;
    final moveWidth = canResize ? width - _resizeHandleWidth : width;

    return [
      Positioned(
        left: left,
        top: top,
        width: moveWidth,
        height: height,
        child: MouseRegion(
          cursor: SystemMouseCursors.grab,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            dragStartBehavior: DragStartBehavior.down,
            onTap: () => widget.onSelectItem?.call(item.id),
            onHorizontalDragStart: (_) => _startDrag(item.id, isResize: false),
            onHorizontalDragUpdate: (details) => _updateDrag(details.delta.dx),
            onHorizontalDragEnd: (_) => _endDrag(item, scheduled),
            onHorizontalDragCancel: () => _endDrag(item, scheduled),
          ),
        ),
      ),
      if (canResize)
        Positioned(
          left: right - _resizeHandleWidth,
          top: top,
          width: _resizeHandleWidth,
          height: height,
          child: MouseRegion(
            cursor: SystemMouseCursors.resizeLeftRight,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              dragStartBehavior: DragStartBehavior.down,
              onTap: () => widget.onSelectItem?.call(item.id),
              onHorizontalDragStart: (_) => _startDrag(item.id, isResize: true),
              onHorizontalDragUpdate: (details) => _updateDrag(details.delta.dx),
              onHorizontalDragEnd: (_) => _endDrag(item, scheduled),
              onHorizontalDragCancel: () => _endDrag(item, scheduled),
            ),
          ),
        ),
    ];
  }
}
