import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/dashboard.dart';
import 'auth_provider.dart';

/// 監控儀表板（2026-09）——只有 OWNER/ADMIN/總經理能成功讀取，其餘角色
/// 呼叫會收到後端 403（見 `DashboardService.get`）。
final spaceDashboardProvider = FutureProvider.autoDispose.family<SpaceDashboard, String>((ref, spaceId) {
  return ref.read(apiClientProvider).spaceDashboard(spaceId);
});
