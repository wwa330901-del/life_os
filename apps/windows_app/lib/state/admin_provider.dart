import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/admin_models.dart';
import 'auth_provider.dart';

final adminUsersProvider = FutureProvider.autoDispose<List<AdminUserSummary>>((ref) {
  return ref.read(apiClientProvider).adminListUsers();
});

final adminSpacesProvider = FutureProvider.autoDispose<List<AdminSpaceSummary>>((ref) {
  return ref.read(apiClientProvider).adminListSpaces();
});

final adminSpaceDetailProvider = FutureProvider.autoDispose
    .family<AdminSpaceDetail, String>((ref, spaceId) {
      return ref.read(apiClientProvider).adminGetSpace(spaceId);
    });
