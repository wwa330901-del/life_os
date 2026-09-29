import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/calendar_event.dart';
import '../core/models/app_user.dart';
import 'auth_provider.dart';
import 'space_provider.dart';

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

final appleCalendarConnectionProvider = FutureProvider.autoDispose
    .family<AppleCalendarConnectionStatus, String>((ref, spaceId) {
      return ref.read(apiClientProvider).getAppleCalendarConnectionStatus(spaceId);
    });

/// Which external calendars this calendar space is connected to — the
/// choices offered by the required 「存到 Google／iPhone」 picker. Empty
/// means neither is connected, and events just live in 元序.
final connectedCalendarTargetsProvider = FutureProvider.autoDispose.family<List<CalendarSyncTarget>, String>((
  ref,
  spaceId,
) async {
  final google = await ref.watch(calendarConnectionProvider(spaceId).future);
  final apple = await ref.watch(appleCalendarConnectionProvider(spaceId).future);
  return [if (google.connected) CalendarSyncTarget.google, if (apple.connected) CalendarSyncTarget.icloud];
});

/// Same as [connectedCalendarTargetsProvider] for screens outside the
/// calendar (代辦事項) — resolves the user's own 行事曆 space first.
final myCalendarTargetsProvider = FutureProvider.autoDispose<List<CalendarSyncTarget>>((ref) async {
  final spaces = await ref.watch(mySpacesProvider.future);
  final calendar = spaces.where((s) => s.type == SpaceType.calendar).firstOrNull;
  if (calendar == null) return const [];
  return ref.watch(connectedCalendarTargetsProvider(calendar.id).future);
});
