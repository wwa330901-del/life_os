import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/execution_photo.dart';
import 'auth_provider.dart';

final executionPhotosProvider = FutureProvider.autoDispose.family<List<ExecutionPhoto>, String>((ref, projectId) {
  return ref.read(apiClientProvider).executionPhotos(projectId);
});
