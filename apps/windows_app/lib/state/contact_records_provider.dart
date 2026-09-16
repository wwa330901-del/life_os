import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/contact_record.dart';
import 'auth_provider.dart';

final contactRecordsProvider = FutureProvider.autoDispose.family<List<ContactRecord>, String>((ref, projectId) {
  return ref.read(apiClientProvider).contactRecords(projectId);
});
