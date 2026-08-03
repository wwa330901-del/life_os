import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project_todo.dart';
import 'auth_provider.dart';

final todoOverviewProvider = FutureProvider.autoDispose<TodoOverview>((ref) {
  return ref.read(apiClientProvider).listAllTodos();
});

/// 代辦事項 is account-level like 知識庫 — a separate top-level destination
/// from `selectedSpaceProvider`, checked by `_RootRouter` (`app.dart`) so
/// it's reachable directly from the space picker without needing a
/// particular space to be open.
class ShowTodoSpaceNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showTodoSpaceProvider = NotifierProvider<ShowTodoSpaceNotifier, bool>(
  ShowTodoSpaceNotifier.new,
);
