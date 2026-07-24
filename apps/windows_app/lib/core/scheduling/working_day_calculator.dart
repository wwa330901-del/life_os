import '../models/holiday_calendar.dart';

/// Date-only working-day arithmetic that skips a project's off-days. Ported
/// from reno_pm's working_day_calculator.dart — used client-side only to
/// back-derive a duration from a user-picked end date (see task_table.dart's
/// end-date column); the schedule itself always comes from the server.
class WorkingDayCalculator {
  /// Inverse of the backend's addWorkingDays: the number of working days
  /// from [start] to [end] inclusive of both ends (so `start == end` on a
  /// working day returns 1, matching how WorkItem.durationDays is defined).
  /// Returns 0 if [end] is before [start].
  static int countWorkingDaysInclusive(DateTime start, DateTime end, HolidayCalendar calendar) {
    final endNormalized = normalizeDate(end);
    var d = normalizeDate(start);
    var count = 0;
    while (!d.isAfter(endNormalized)) {
      if (calendar.isWorkingDay(d)) count++;
      d = d.add(const Duration(days: 1));
    }
    return count;
  }
}
