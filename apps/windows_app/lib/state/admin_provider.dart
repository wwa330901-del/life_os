import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/admin_models.dart';
import 'auth_provider.dart';

final adminUsersProvider = FutureProvider.autoDispose<List<AdminUserSummary>>((ref) {
  return ref.read(apiClientProvider).adminListUsers();
});
