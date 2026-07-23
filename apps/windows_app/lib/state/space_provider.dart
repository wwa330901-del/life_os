import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/app_user.dart';
import 'auth_provider.dart';

/// Re-fetches whenever the auth session changes (login/logout).
final mySpacesProvider = FutureProvider<List<SpaceSummary>>((ref) async {
  final session = await ref.watch(authControllerProvider.future);
  if (session == null) return const [];
  return ref.read(apiClientProvider).mySpaces();
});

class SelectedSpaceNotifier extends Notifier<SpaceSummary?> {
  @override
  SpaceSummary? build() => null;

  void select(SpaceSummary space) => state = space;

  void clear() => state = null;
}

final selectedSpaceProvider =
    NotifierProvider<SelectedSpaceNotifier, SpaceSummary?>(
      SelectedSpaceNotifier.new,
    );
