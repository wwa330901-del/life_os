import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/daily_report.dart';
import 'auth_provider.dart';

final dailyReportsProvider = FutureProvider.autoDispose.family<List<DailyReport>, String>((ref, projectId) {
  return ref.read(apiClientProvider).dailyReports(projectId);
});

/// 今日未交日報的專案清單（空間層級彙總）。
final missingDailyReportsTodayProvider =
    FutureProvider.autoDispose.family<List<MissingDailyReportProject>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).missingDailyReportsToday(spaceId);
    });
