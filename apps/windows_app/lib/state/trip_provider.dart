import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/trip.dart';
import 'auth_provider.dart';

final tripsProvider = FutureProvider.autoDispose<List<Trip>>((ref) {
  return ref.read(apiClientProvider).listTrips();
});

final tripProvider = FutureProvider.autoDispose.family<Trip, String>((ref, id) {
  return ref.read(apiClientProvider).getTrip(id);
});

/// 已連結的外部行事曆（GOOGLE / ICLOUD），「放進行事曆」要選。
final tripCalendarTargetsProvider = FutureProvider.autoDispose<List<String>>((ref) {
  return ref.read(apiClientProvider).getTripCalendarTargets();
});

/// 旅行 is account-level like 日記 — a separate top-level destination
/// checked by `_RootRouter` (`app.dart`).
class ShowTripsNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showTripsProvider = NotifierProvider<ShowTripsNotifier, bool>(ShowTripsNotifier.new);
