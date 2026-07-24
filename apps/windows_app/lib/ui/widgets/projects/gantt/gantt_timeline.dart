import 'package:flutter/material.dart';

import '../../../../core/models/holiday_calendar.dart';
import '../../../../core/models/schedule_result.dart';
import '../../../../core/models/work_item.dart';
import '../../../../core/scheduling/gantt_date_range.dart';
import 'gantt_colors.dart';
import 'gantt_header_painter.dart';
import 'gantt_layout.dart';
import 'gantt_painter.dart';
import 'linked_scroll_controllers.dart';

/// Right-hand pane: a horizontally-scrollable date ruler + bar canvas. Its
/// vertical scroll is driven by [verticalController], which the caller also
/// attaches to the left-hand task list so both panes stay row-aligned.
/// Ported from reno_pm's gantt_timeline.dart.
class GanttTimeline extends StatefulWidget {
  final List<WorkItem> orderedItems;
  final ScheduleResult scheduleResult;
  final HolidayCalendar calendar;
  final DateTime projectStartDate;
  final ScrollController verticalController;
  final String? selectedItemId;
  final ValueChanged<String>? onSelectItem;
  final double dayWidth;

  const GanttTimeline({
    super.key,
    required this.orderedItems,
    required this.scheduleResult,
    required this.calendar,
    required this.projectStartDate,
    required this.verticalController,
    this.selectedItemId,
    this.onSelectItem,
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

  @override
  void dispose() {
    _horizontal.dispose();
    super.dispose();
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
            child: SingleChildScrollView(
              controller: _horizontal.second,
              scrollDirection: Axis.horizontal,
              physics: const ClampingScrollPhysics(),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (details) {
                  if (widget.onSelectItem == null) return;
                  final row = (details.localPosition.dy / GanttLayout.rowHeight)
                      .floor();
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
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
