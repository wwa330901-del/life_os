import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project.dart';
import 'auth_provider.dart';

/// The 類型/狀態 dropdown option lists — platform-wide, not scoped to a
/// space or project (see `apps/api/src/projects/project-options.service.ts`).
final projectTypeOptionsProvider = FutureProvider<List<ProjectOption>>((ref) {
  return ref.read(apiClientProvider).listProjectTypeOptions();
});

final projectStatusOptionsProvider = FutureProvider<List<ProjectOption>>((ref) {
  return ref.read(apiClientProvider).listProjectStatusOptions();
});
