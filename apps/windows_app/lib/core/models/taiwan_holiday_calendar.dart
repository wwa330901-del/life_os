/// A single named entry from Taiwan's official government holiday
/// calendar (國定假日/民俗節日/補假).
class TaiwanHolidayEntry {
  final DateTime date;
  final String description;

  const TaiwanHolidayEntry(this.date, this.description);
}

/// Official Taiwan government holidays, sourced from 行政院人事行政總處's
/// "中華民國政府行政機關辦公日曆表" (https://data.gov.tw/dataset/14718),
/// republished as clean JSON by https://github.com/ruyut/TaiwanCalendar.
///
/// Only named holidays are included here — NOT every plain
/// government-standard Saturday off-day, since construction crews commonly
/// still work ordinary Saturdays unlike office workers who get a full
/// two-day weekend. Applied automatically by
/// `HolidayCalendar.isWorkingDay` whenever `useTaiwanGovernmentCalendar` is
/// on (the default) — there's no manual per-year import step; any date
/// within a covered year is just correct.
///
/// Kept in lockstep with the backend's copy
/// (apps/api/src/projects/scheduling/taiwan-holiday-calendar.ts) — this
/// client-side copy is used only for rendering off-day shading in the Gantt
/// chart, never for computing schedule dates (those always come from the
/// server).
final taiwanHolidaysByYear = <int, List<TaiwanHolidayEntry>>{
  2026: [
    TaiwanHolidayEntry(DateTime(2026, 1, 1), '開國紀念日'),
    TaiwanHolidayEntry(DateTime(2026, 2, 15), '小年夜'),
    TaiwanHolidayEntry(DateTime(2026, 2, 16), '農曆除夕'),
    TaiwanHolidayEntry(DateTime(2026, 2, 17), '春節'),
    TaiwanHolidayEntry(DateTime(2026, 2, 18), '春節'),
    TaiwanHolidayEntry(DateTime(2026, 2, 19), '春節'),
    TaiwanHolidayEntry(DateTime(2026, 2, 20), '補假'),
    TaiwanHolidayEntry(DateTime(2026, 2, 27), '補假'),
    TaiwanHolidayEntry(DateTime(2026, 2, 28), '和平紀念日'),
    TaiwanHolidayEntry(DateTime(2026, 4, 3), '補假'),
    TaiwanHolidayEntry(DateTime(2026, 4, 4), '兒童節'),
    TaiwanHolidayEntry(DateTime(2026, 4, 5), '清明節'),
    TaiwanHolidayEntry(DateTime(2026, 4, 6), '補假'),
    TaiwanHolidayEntry(DateTime(2026, 5, 1), '勞動節'),
    TaiwanHolidayEntry(DateTime(2026, 6, 19), '端午節'),
    TaiwanHolidayEntry(DateTime(2026, 9, 25), '中秋節'),
    TaiwanHolidayEntry(DateTime(2026, 9, 28), '孔子誕辰紀念日/教師節'),
    TaiwanHolidayEntry(DateTime(2026, 10, 9), '補假'),
    TaiwanHolidayEntry(DateTime(2026, 10, 10), '國慶日'),
    TaiwanHolidayEntry(DateTime(2026, 10, 25), '臺灣光復暨金門古寧頭大捷紀念日'),
    TaiwanHolidayEntry(DateTime(2026, 10, 26), '補假'),
    TaiwanHolidayEntry(DateTime(2026, 12, 25), '行憲紀念日'),
  ],
  2027: [
    TaiwanHolidayEntry(DateTime(2027, 1, 1), '開國紀念日'),
    TaiwanHolidayEntry(DateTime(2027, 2, 4), '小年夜'),
    TaiwanHolidayEntry(DateTime(2027, 2, 5), '農曆除夕'),
    TaiwanHolidayEntry(DateTime(2027, 2, 6), '春節'),
    TaiwanHolidayEntry(DateTime(2027, 2, 7), '春節'),
    TaiwanHolidayEntry(DateTime(2027, 2, 8), '春節'),
    TaiwanHolidayEntry(DateTime(2027, 2, 9), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 2, 10), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 2, 28), '和平紀念日'),
    TaiwanHolidayEntry(DateTime(2027, 3, 1), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 4, 4), '兒童節'),
    TaiwanHolidayEntry(DateTime(2027, 4, 5), '清明節'),
    TaiwanHolidayEntry(DateTime(2027, 4, 6), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 4, 30), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 5, 1), '勞動節'),
    TaiwanHolidayEntry(DateTime(2027, 6, 9), '端午節'),
    TaiwanHolidayEntry(DateTime(2027, 9, 15), '中秋節'),
    TaiwanHolidayEntry(DateTime(2027, 9, 28), '孔子誕辰紀念日/教師節'),
    TaiwanHolidayEntry(DateTime(2027, 10, 10), '國慶日'),
    TaiwanHolidayEntry(DateTime(2027, 10, 11), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 10, 25), '臺灣光復暨金門古寧頭大捷紀念日'),
    TaiwanHolidayEntry(DateTime(2027, 12, 24), '補假'),
    TaiwanHolidayEntry(DateTime(2027, 12, 25), '行憲紀念日'),
    TaiwanHolidayEntry(DateTime(2027, 12, 31), '補假'),
  ],
};

/// Official 補班日 (mandatory Saturday/Sunday make-up workdays) by year.
/// Both currently-covered years have none — recent calendars have leaned
/// on extra 補假 days off instead — but the structure stays ready for a
/// year that does have one.
final taiwanMakeupWorkdaysByYear = <int, List<DateTime>>{2026: [], 2027: []};

DateTime _normalize(DateTime d) => DateTime(d.year, d.month, d.day);

final Set<DateTime> _taiwanHolidayDates = {
  for (final entries in taiwanHolidaysByYear.values)
    for (final e in entries) _normalize(e.date),
};

final Set<DateTime> _taiwanMakeupWorkdayDates = {
  for (final dates in taiwanMakeupWorkdaysByYear.values)
    for (final d in dates) _normalize(d),
};

/// Whether [date] is one of the named Taiwan government holidays.
bool isTaiwanHoliday(DateTime date) =>
    _taiwanHolidayDates.contains(_normalize(date));

/// Whether [date] is an official 補班日 (mandatory make-up workday).
bool isTaiwanMakeupWorkday(DateTime date) =>
    _taiwanMakeupWorkdayDates.contains(_normalize(date));
