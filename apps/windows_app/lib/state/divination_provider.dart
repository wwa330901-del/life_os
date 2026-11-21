import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/divination.dart';
import 'auth_provider.dart';

final birthProfileProvider = FutureProvider.autoDispose<BirthProfile>((ref) {
  return ref.read(apiClientProvider).getBirthProfile();
});

final divinationHistoryProvider = FutureProvider.autoDispose<List<DivinationRecord>>((ref) {
  return ref.read(apiClientProvider).listDivinations();
});

