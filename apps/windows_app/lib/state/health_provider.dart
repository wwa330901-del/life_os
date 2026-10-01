import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/health_record.dart';
import 'auth_provider.dart';

/// Newest first, optionally one type (the filter chips set [healthTypeFilterProvider]).
final healthRecordsProvider = FutureProvider.autoDispose<List<HealthRecord>>((ref) {
  final type = ref.watch(healthTypeFilterProvider);
  return ref.read(apiClientProvider).listHealthRecords(type: type);
});

/// 最近 7 天
final healthSummaryProvider = FutureProvider.autoDispose<HealthSummary>((ref) {
  return ref.read(apiClientProvider).getHealthSummary(days: 7);
});

class HealthTypeFilterNotifier extends Notifier<HealthType?> {
  @override
  HealthType? build() => null;

  void set(HealthType? value) => state = value;
}

final healthTypeFilterProvider = NotifierProvider<HealthTypeFilterNotifier, HealthType?>(HealthTypeFilterNotifier.new);

/// 健康 is account-level like 日記 — a separate top-level destination
/// checked by `_RootRouter` (`app.dart`), same shape as `showJournalProvider`.
class ShowHealthNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showHealthProvider = NotifierProvider<ShowHealthNotifier, bool>(ShowHealthNotifier.new);
