import '../models/schedule_result.dart';

class GanttDateRange {
  final DateTime start;
  final int dayCount;

  const GanttDateRange({required this.start, required this.dayCount});
}

/// Shared by every Gantt-rendering surface so they always agree on which
/// date range to draw. Ported from reno_pm's gantt_date_range.dart.
GanttDateRange computeGanttDateRange({
  required DateTime projectStartDate,
  required ScheduleResult scheduleResult,
}) {
  var earliest = projectStartDate;
  var latest = projectStartDate.add(const Duration(days: 14));

  for (final scheduled in scheduleResult.byId.values) {
    if (scheduled.start.isBefore(earliest)) earliest = scheduled.start;
    if (scheduled.end.isAfter(latest)) latest = scheduled.end;
  }

  final start = earliest.subtract(const Duration(days: 3));
  final end = latest.add(const Duration(days: 7));
  return GanttDateRange(start: start, dayCount: end.difference(start).inDays);
}
