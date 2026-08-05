import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/calendar_event.dart';
import '../core/models/calendar_share.dart';
import 'auth_provider.dart';

final calendarSharesGivenProvider = FutureProvider.autoDispose<List<CalendarShare>>((ref) {
  return ref.read(apiClientProvider).listCalendarSharesGiven();
});

final calendarSharesReceivedProvider = FutureProvider.autoDispose<List<CalendarShare>>((ref) {
  return ref.read(apiClientProvider).listCalendarSharesReceived();
});

/// (from, to) — the visible month range, same shape as `CalendarMonthKey`
/// but for the combined 共用行事曆 view.
typedef CombinedCalendarQuery = ({DateTime from, DateTime to});

final combinedCalendarEventsProvider = FutureProvider.autoDispose
    .family<({List<CalendarEvent> own, List<SharedCalendarEntry> shared}), CombinedCalendarQuery>((
      ref,
      query,
    ) {
      return ref.read(apiClientProvider).combinedCalendarEvents(from: query.from, to: query.to);
    });
