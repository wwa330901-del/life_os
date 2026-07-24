import 'taiwan_holiday_calendar.dart';

DateTime normalizeDate(DateTime date) =>
    DateTime(date.year, date.month, date.day);

/// Per-project working-day rules: a weekly recurring off-day set, Taiwan's
/// official government holiday calendar (on by default), and one-off
/// manual exceptions in both directions (extra holiday / forced workday)
/// that always take precedence over both of those. Used client-side only
/// for rendering off-day shading in the Gantt chart (see gantt_painter.dart
/// / gantt_header_painter.dart) — actual schedule dates always come from
/// the server, never computed from this locally.
class HolidayCalendar {
  /// [DateTime.monday]..[DateTime.sunday] values that are off by default every week.
  final Set<int> weeklyOffDays;

  final bool useTaiwanGovernmentCalendar;

  final Set<DateTime> adHocHolidays;

  final Set<DateTime> adHocWorkdays;

  const HolidayCalendar({
    this.weeklyOffDays = const {DateTime.sunday},
    this.useTaiwanGovernmentCalendar = true,
    this.adHocHolidays = const {},
    this.adHocWorkdays = const {},
  });

  bool isWorkingDay(DateTime date) {
    final day = normalizeDate(date);
    if (adHocWorkdays.contains(day)) return true;
    if (adHocHolidays.contains(day)) return false;
    if (useTaiwanGovernmentCalendar) {
      if (isTaiwanMakeupWorkday(day)) return true;
      if (isTaiwanHoliday(day)) return false;
    }
    return !weeklyOffDays.contains(day.weekday);
  }

  factory HolidayCalendar.fromProjectJson(Map<String, dynamic> json) =>
      HolidayCalendar(
        weeklyOffDays: (json['weeklyOffDays'] as List<dynamic>)
            .map((e) => e as int)
            .toSet(),
        useTaiwanGovernmentCalendar:
            json['useTaiwanGovernmentCalendar'] as bool,
        adHocHolidays: (json['adHocHolidays'] as List<dynamic>)
            .map((e) => normalizeDate(DateTime.parse(e as String)))
            .toSet(),
        adHocWorkdays: (json['adHocWorkdays'] as List<dynamic>)
            .map((e) => normalizeDate(DateTime.parse(e as String)))
            .toSet(),
      );
}
