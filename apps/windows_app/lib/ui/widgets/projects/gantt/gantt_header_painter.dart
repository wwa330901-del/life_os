import 'package:flutter/material.dart';

import '../../../../core/models/holiday_calendar.dart';
import 'gantt_colors.dart';
import 'gantt_layout.dart';

const _weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];

/// Draws the date ruler above the Gantt bars: month/day grouping on top,
/// weekday-per-column on the bottom row. Ported from reno_pm's
/// gantt_header_painter.dart, restyled to read from [GanttColors] so it
/// follows the app's theme.
class GanttHeaderPainter extends CustomPainter {
  final DateTime timelineStart;
  final int dayCount;
  final double dayWidth;
  final GanttColors colors;

  /// When provided, off-day (holiday/weekly-off) columns are shaded the
  /// same tone as the chart body below, so a non-workable day reads as one
  /// continuous column from the date ruler all the way down.
  final HolidayCalendar? calendar;

  final String? fontFamily;

  GanttHeaderPainter({
    required this.timelineStart,
    required this.dayCount,
    required this.colors,
    this.dayWidth = GanttLayout.dayWidth,
    this.calendar,
    this.fontFamily,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final bgPaint = Paint()..color = colors.canvasBackground;
    canvas.drawRect(Offset.zero & size, bgPaint);

    final holidayCalendar = calendar;
    if (holidayCalendar != null) {
      final offDayPaint = Paint()..color = colors.offDayShade;
      for (var i = 0; i < dayCount; i++) {
        final date = timelineStart.add(Duration(days: i));
        if (!holidayCalendar.isWorkingDay(date)) {
          canvas.drawRect(
            Rect.fromLTWH(i * dayWidth, 0, dayWidth, size.height),
            offDayPaint,
          );
        }
      }
    }

    final borderPaint = Paint()
      ..color = colors.gridLine
      ..strokeWidth = 0.75;
    canvas.drawLine(
      Offset(0, size.height - 1),
      Offset(size.width, size.height - 1),
      borderPaint,
    );

    int? currentMonth;
    double monthSegmentStartX = 0;

    void flushMonthLabel(double endX, DateTime forMonth) {
      final text = '${forMonth.year}年${forMonth.month}月';
      _drawText(
        canvas,
        text,
        monthSegmentStartX + 4,
        4,
        endX - monthSegmentStartX - 8,
      );
    }

    for (var i = 0; i < dayCount; i++) {
      final date = timelineStart.add(Duration(days: i));
      final x = i * dayWidth;

      if (currentMonth == null) {
        currentMonth = date.month;
        monthSegmentStartX = x;
      } else if (date.month != currentMonth || date.day == 1) {
        flushMonthLabel(x, DateTime(date.year, currentMonth, 1));
        canvas.drawLine(Offset(x, 0), Offset(x, size.height / 2), borderPaint);
        currentMonth = date.month;
        monthSegmentStartX = x;
      }

      canvas.drawLine(
        Offset(x, size.height / 2),
        Offset(x, size.height),
        Paint()
          ..color = colors.gridLine.withValues(alpha: colors.gridLine.a * 0.6)
          ..strokeWidth = 0.75,
      );

      final label = '${date.day}\n${_weekdayLabels[date.weekday - 1]}';
      _drawCenteredText(
        canvas,
        label,
        x + dayWidth / 2,
        size.height / 2 + 2,
        dayWidth,
      );
    }

    if (currentMonth != null) {
      flushMonthLabel(
        dayCount * dayWidth,
        DateTime(timelineStart.year, currentMonth, 1),
      );
    }
  }

  void _drawText(
    Canvas canvas,
    String text,
    double x,
    double y,
    double maxWidth,
  ) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.2,
          color: colors.textPrimary,
          fontFamily: fontFamily,
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth < 0 ? 0 : maxWidth);
    painter.paint(canvas, Offset(x, y));
  }

  void _drawCenteredText(
    Canvas canvas,
    String text,
    double centerX,
    double y,
    double width,
  ) {
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontSize: 10,
          color: colors.textMuted,
          height: 1.1,
          fontFamily: fontFamily,
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout(minWidth: width, maxWidth: width);
    painter.paint(canvas, Offset(centerX - width / 2, y));
  }

  @override
  bool shouldRepaint(covariant GanttHeaderPainter oldDelegate) {
    return oldDelegate.timelineStart != timelineStart ||
        oldDelegate.dayCount != dayCount ||
        oldDelegate.dayWidth != dayWidth ||
        oldDelegate.calendar != calendar ||
        oldDelegate.fontFamily != fontFamily ||
        oldDelegate.colors != colors;
  }
}
