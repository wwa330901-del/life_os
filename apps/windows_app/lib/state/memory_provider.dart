import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/memory.dart';
import 'auth_provider.dart';

/// AI 記住的事，最新的在前。
final memoriesProvider = FutureProvider.autoDispose<List<UserMemory>>((ref) {
  return ref.read(apiClientProvider).listMemories();
});

/// 重要日子，最快到的在前。
final importantDatesProvider = FutureProvider.autoDispose<List<ImportantDate>>((ref) {
  return ref.read(apiClientProvider).listImportantDates();
});
