import 'package:flutter_riverpod/flutter_riverpod.dart';

/// AI 問答 is account-level like 知識庫/代辦事項 — a separate top-level
/// destination from `selectedSpaceProvider`, checked by `_RootRouter`
/// (`app.dart`) so it's reachable directly from the space picker without
/// needing a particular space to be open.
class ShowAiAssistantNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showAiAssistantProvider = NotifierProvider<ShowAiAssistantNotifier, bool>(
  ShowAiAssistantNotifier.new,
);
