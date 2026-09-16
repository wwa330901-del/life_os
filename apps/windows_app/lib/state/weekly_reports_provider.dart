import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/weekly_report.dart';
import 'auth_provider.dart';

final weeklyReportsProvider = FutureProvider.autoDispose.family<List<WeeklyReport>, String>((ref, projectId) {
  return ref.read(apiClientProvider).weeklyReports(projectId);
});

/// 本週未交週報的專案清單（空間層級彙總）。
final missingWeeklyReportsThisWeekProvider =
    FutureProvider.autoDispose.family<List<MissingWeeklyReportProject>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).missingWeeklyReportsThisWeek(spaceId);
    });
