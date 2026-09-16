import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/material_submission.dart';
import 'auth_provider.dart';

final materialSubmissionsProvider = FutureProvider.autoDispose.family<List<MaterialSubmission>, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).materialSubmissions(projectId);
});
