import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/calendar_event.dart';
import 'auth_provider.dart';

/// Keyed by (spaceId, month-start) so switching months in the calendar
/// screen doesn't refetch a month it's already shown.
class CalendarMonthKey {
  const CalendarMonthKey(this.spaceId, this.monthStart);
  final String spaceId;
  final DateTime monthStart;

  @override
  bool operator ==(Object other) =>
      other is CalendarMonthKey && other.spaceId == spaceId && other.monthStart == monthStart;

  @override
  int get hashCode => Object.hash(spaceId, monthStart);
}

final calendarEventsProvider = FutureProvider.autoDispose.family<List<CalendarEvent>, CalendarMonthKey>((
  ref,
  key,
) async {
  final from = DateTime(key.monthStart.year, key.monthStart.month - 1, 25);
  final to = DateTime(key.monthStart.year, key.monthStart.month + 2, 5);
  return ref.read(apiClientProvider).listCalendarEvents(key.spaceId, from: from, to: to);
});

final calendarConnectionProvider = FutureProvider.autoDispose.family<GoogleCalendarConnectionStatus, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).getCalendarConnectionStatus(spaceId);
});
