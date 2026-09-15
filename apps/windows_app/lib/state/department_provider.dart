import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/department.dart';
import 'auth_provider.dart';

/// This company space's own departments (each with its own nested ranks),
/// sorted by `sortOrder`.
final departmentsProvider = FutureProvider.family<List<Department>, String>((ref, spaceId) async {
  return ref.read(apiClientProvider).listDepartments(spaceId);
});

/// This company space's full permission-rule list — only meaningful to an
/// OWNER (the backend 404/403s otherwise), matching this screen's own gate.
final permissionRulesProvider = FutureProvider.family<List<PermissionRule>, String>((ref, spaceId) async {
  return ref.read(apiClientProvider).listPermissionRules(spaceId);
});

/// This company space's designated 總經理 (異動留痕通知對象, 2026-09) — null
/// means none set yet.
final generalManagerProvider = FutureProvider.family<String?, String>((ref, spaceId) async {
  return ref.read(apiClientProvider).getGeneralManager(spaceId);
});
