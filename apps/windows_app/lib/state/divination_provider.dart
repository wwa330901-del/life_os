import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/divination.dart';
import 'auth_provider.dart';

final birthProfileProvider = FutureProvider.autoDispose<BirthProfile>((ref) {
  return ref.read(apiClientProvider).getBirthProfile();
});

final divinationHistoryProvider = FutureProvider.autoDispose<List<DivinationRecord>>((ref) {
  return ref.read(apiClientProvider).listDivinations();
});

/// 算命 is account-level — a separate top-level destination checked by
/// `_RootRouter` (`app.dart`), same shape as `showJournalProvider`.
class ShowDivinationNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showDivinationProvider = NotifierProvider<ShowDivinationNotifier, bool>(ShowDivinationNotifier.new);
