import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/journal_entry.dart';
import 'auth_provider.dart';

/// Newest first. The search box sets [journalKeywordProvider].
final journalEntriesProvider = FutureProvider.autoDispose<List<JournalEntry>>((ref) {
  final keyword = ref.watch(journalKeywordProvider);
  return ref.read(apiClientProvider).listJournalEntries(keyword: keyword);
});

class JournalKeywordNotifier extends Notifier<String> {
  @override
  String build() => '';

  void set(String value) => state = value.trim();
}

final journalKeywordProvider = NotifierProvider<JournalKeywordNotifier, String>(JournalKeywordNotifier.new);

/// 日記 is account-level like 人生目標 — a separate top-level destination
/// checked by `_RootRouter` (`app.dart`), same shape as `showLifeGoalsProvider`.
class ShowJournalNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showJournalProvider = NotifierProvider<ShowJournalNotifier, bool>(ShowJournalNotifier.new);
