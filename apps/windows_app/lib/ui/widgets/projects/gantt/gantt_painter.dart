import 'package:flutter/material.dart';

import '../../../../core/models/holiday_calendar.dart';
import '../../../../core/models/schedule_result.dart';
import '../../../../core/models/work_item.dart';
import '../../../../core/models/work_item_hierarchy.dart';
import 'gantt_colors.dart';
import 'gantt_layout.dart';

/// Color for [item], shared by every descendant of the same top-level
/// (root) ancestor so a whole 母項目 branch reads as one visual group in
/// both the task table and the Gantt bars, rather than each row getting an
/// unrelated color by its position. An explicit [WorkItem.colorValue]
/// always wins. [palette] is assigned in fixed order by root branch index —
/// never cycled by value — see [GanttColors.palette].
Color colorForItem(WorkItem item, List<WorkItem> allItems, List<Color> palette) {
  if (item.colorValue != null) return Color(item.colorValue!);

  final itemsById = <String, WorkItem>{for (final i in allItems) i.id: i};
  var root = item;
  final visited = <String>{};
  while (root.parentId != null && visited.add(root.id)) {
    final parent = itemsById[root.parentId];
    if (parent == null) break;
    root = parent;
  }

  final topLevel = allItems.where((i) => i.parentId == null).toList()
    ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  final rootIndex = topLevel.indexWhere((i) => i.id == root.id);
  final paletteIndex = rootIndex >= 0 ? rootIndex : 0;
  return palette[paletteIndex % palette.length];
}

/// Draws the timeline body: off-day column shading, grid lines, today
/// marker, task bars (with progress fill), and dependency arrows. Ported
/// from reno_pm's gantt_painter.dart, restyled to read colors from
/// [GanttColors] instead of a fixed light-mode palette, so it follows
/// 元序's theme (and stays legible in dark mode) instead of looking like a
/// generic chart library dropped on top of it.
class GanttPainter extends CustomPainter {
  final List<WorkItem> orderedItems;
  final ScheduleResult scheduleResult;
  final HolidayCalendar calendar;
  final DateTime timelineStart;
  final int dayCount;
  final DateTime today;
  final String? selectedItemId;
  final double dayWidth;
  final String? fontFamily;
  final GanttColors colors;

  GanttPainter({
    required this.orderedItems,
    required this.scheduleResult,
    required this.calendar,
    required this.timelineStart,
    required this.dayCount,
    required this.today,
    required this.colors,
    this.selectedItemId,
    this.dayWidth = GanttLayout.dayWidth,
    this.fontFamily,
  });

  double _xForDate(DateTime date) {
    final days = date.difference(timelineStart).inDays;
    return days * dayWidth;
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = colors.canvasBackground);
    _paintOffDayShading(canvas, size);
    _paintGridLines(canvas, size);
    _paintTodayMarker(canvas, size);
    _paintDependencyArrows(canvas);
    _paintBars(canvas);
  }

  void _paintOffDayShading(Canvas canvas, Size size) {
    final paint = Paint()..color = colors.offDayShade;
    for (var i = 0; i < dayCount; i++) {
      final date = timelineStart.add(Duration(days: i));
      if (!calendar.isWorkingDay(date)) {
        canvas.drawRect(
          Rect.fromLTWH(i * dayWidth, 0, dayWidth, size.height),
          paint,
        );
      }
    }
  }

  void _paintGridLines(Canvas canvas, Size size) {
    // Hairline, recessive — the grid should recede behind the bars, not
    // compete with them.
    final linePaint = Paint()
      ..color = colors.gridLine
      ..strokeWidth = 0.75;
    for (var i = 0; i <= dayCount; i++) {
      final x = i * dayWidth;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), linePaint);
    }
    for (var i = 0; i <= orderedItems.length; i++) {
      final y = i * GanttLayout.rowHeight;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
    }
  }

  void _paintTodayMarker(Canvas canvas, Size size) {
    final normalizedToday = DateTime(today.year, today.month, today.day);
    if (normalizedToday.isBefore(timelineStart) ||
        normalizedToday.isAfter(timelineStart.add(Duration(days: dayCount)))) {
      return;
    }
    final x = _xForDate(normalizedToday);
    final paint = Paint()
      ..color = colors.todayMarker
      ..strokeWidth = 1.5;
    canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
  }

  void _paintDependencyArrows(Canvas canvas) {
    final rowIndexById = <String, int>{
      for (var i = 0; i < orderedItems.length; i++) orderedItems[i].id: i,
    };
    final arrowPaint = Paint()
      ..color = colors.dependencyArrow
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    for (final item in orderedItems) {
      final successorScheduled = scheduleResult.byId[item.id];
      if (successorScheduled == null) continue;
      final successorRow = rowIndexById[item.id];
      if (successorRow == null) continue;

      for (final predId in item.predecessorIds) {
        final predScheduled = scheduleResult.byId[predId];
        final predRow = rowIndexById[predId];
        if (predScheduled == null || predRow == null) continue;

        final fromX = _xForDate(predScheduled.end.add(const Duration(days: 1)));
        final fromY =
            predRow * GanttLayout.rowHeight + GanttLayout.rowHeight / 2;
        final toX = _xForDate(successorScheduled.start);
        final toY =
            successorRow * GanttLayout.rowHeight + GanttLayout.rowHeight / 2;

        final path = Path()..moveTo(fromX, fromY);
        final midX = fromX + (toX - fromX) / 2;
        path.lineTo(midX, fromY);
        path.lineTo(midX, toY);
        path.lineTo(toX, toY);
        canvas.drawPath(path, arrowPaint);

        // Small arrowhead.
        final arrowSize = 3.5;
        final headPath = Path()
          ..moveTo(toX, toY)
          ..lineTo(toX - arrowSize, toY - arrowSize)
          ..lineTo(toX - arrowSize, toY + arrowSize)
          ..close();
        canvas.drawPath(headPath, Paint()..color = colors.dependencyArrow);
      }
    }
  }

  void _paintBars(Canvas canvas) {
    final summaryRowIds = parentItemIds(orderedItems);
    for (var i = 0; i < orderedItems.length; i++) {
      final item = orderedItems[i];
      final scheduled = scheduleResult.byId[item.id];
      if (scheduled == null) continue; // excluded due to a dependency cycle

      final left = _xForDate(scheduled.start);
      final right = _xForDate(scheduled.end.add(const Duration(days: 1)));
      final top = i * GanttLayout.rowHeight + GanttLayout.barVerticalPadding;
      final bottom =
          (i + 1) * GanttLayout.rowHeight - GanttLayout.barVerticalPadding;

      if (summaryRowIds.contains(item.id)) {
        // No name label here: the bracket + tick marks already occupy the
        // row, and text placed near them ends up visually blocked by the
        // indicator rather than readable.
        _paintSummaryBar(
          canvas,
          left,
          right,
          top,
          bottom,
          item.id == selectedItemId,
        );
        continue;
      }

      final rect = Rect.fromLTRB(left, top, right, bottom);
      final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(4));

      final color = colorForItem(item, orderedItems, colors.palette);
      canvas.drawRRect(rrect, Paint()..color = color);

      if (item.progressPercent > 0) {
        final progressWidth =
            (right - left) * item.progressPercent.clamp(0.0, 1.0);
        final progressRect = Rect.fromLTRB(
          left,
          top,
          left + progressWidth,
          bottom,
        );
        canvas.drawRRect(
          RRect.fromRectAndRadius(progressRect, const Radius.circular(4)),
          Paint()..color = color.withValues(alpha: 0.55),
        );
      }

      if (item.id == selectedItemId) {
        canvas.drawRRect(
          rrect,
          Paint()
            ..color = colors.selectionOutline
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5,
        );
      }

      _paintBarLabel(canvas, item.name, rect);
    }
  }

  /// Labels a leaf bar with its work-item name drawn just to the right of
  /// the bar. Drawing it on the bar itself hid the name entirely whenever a
  /// short-duration item's bar was narrower than the text, so the label
  /// lives outside the bar instead — always readable regardless of bar
  /// width.
  void _paintBarLabel(Canvas canvas, String name, Rect barRect) {
    const horizontalGap = 8.0;

    final painter = TextPainter(
      text: TextSpan(
        text: name,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          letterSpacing: 0.1,
          color: colors.textPrimary,
          fontFamily: fontFamily,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: 400);

    final x = barRect.right + horizontalGap;
    final y = barRect.top + (barRect.height - painter.height) / 2;
    painter.paint(canvas, Offset(x, y));
  }

  /// A 母項目 (parent/summary) row: a thin bracket bar spanning its
  /// descendants' earliest start to latest end — the standard MS-Project
  /// style visual cue that this row is a derived aggregate, not a real task.
  void _paintSummaryBar(
    Canvas canvas,
    double left,
    double right,
    double top,
    double bottom,
    bool selected,
  ) {
    const barThickness = 4.0;
    const tickWidth = 6.0;
    final barTop = top + (bottom - top) * 0.3;
    final barBottom = barTop + barThickness;
    final paint = Paint()..color = colors.summaryBar;

    canvas.drawRect(Rect.fromLTRB(left, barTop, right, barBottom), paint);
    canvas.drawPath(
      Path()
        ..moveTo(left, barBottom)
        ..lineTo(left + tickWidth, barBottom)
        ..lineTo(left, bottom)
        ..close(),
      paint,
    );
    canvas.drawPath(
      Path()
        ..moveTo(right, barBottom)
        ..lineTo(right - tickWidth, barBottom)
        ..lineTo(right, bottom)
        ..close(),
      paint,
    );

    if (selected) {
      canvas.drawRect(
        Rect.fromLTRB(left, top, right, bottom),
        Paint()
          ..color = colors.selectionOutline
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }
  }

  @override
  bool shouldRepaint(covariant GanttPainter oldDelegate) {
    return oldDelegate.orderedItems != orderedItems ||
        oldDelegate.scheduleResult != scheduleResult ||
        oldDelegate.calendar != calendar ||
        oldDelegate.timelineStart != timelineStart ||
        oldDelegate.dayCount != dayCount ||
        oldDelegate.selectedItemId != selectedItemId ||
        oldDelegate.dayWidth != dayWidth ||
        oldDelegate.fontFamily != fontFamily ||
        oldDelegate.colors != colors;
  }
}
