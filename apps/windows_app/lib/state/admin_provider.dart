import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/admin_models.dart';
import '../core/models/ai_usage.dart';
import 'auth_provider.dart';

final adminUsersProvider = FutureProvider.autoDispose<List<AdminUserSummary>>((ref) {
  return ref.read(apiClientProvider).adminListUsers();
});

/// 管理員：所有使用者的 AI 用量。
final adminAiUsageProvider = FutureProvider.autoDispose<AdminAiUsage>((ref) {
  return ref.read(apiClientProvider).getAdminAiUsage();
});
