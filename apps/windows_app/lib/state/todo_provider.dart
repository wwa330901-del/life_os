import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/project_todo.dart';
import 'auth_provider.dart';

final todoOverviewProvider = FutureProvider.autoDispose<TodoOverview>((ref) {
  return ref.read(apiClientProvider).listAllTodos();
});

typedef CompletedTodosQuery = ({String? search});

/// One search's worth of loaded pages of the 已完成 history — mirrors
/// `KnowledgeItemsPageState`'s shape/loadMore pattern (see 大系統V1.43.0),
/// duplicated locally rather than shared since it's the only other user of
/// this pattern so far.
class CompletedTodosPageState {
  const CompletedTodosPageState({required this.items, required this.cursor, this.isLoadingMore = false});

  final List<CompletedTodoEntry> items;
  final String? cursor;
  final bool isLoadingMore;

  bool get hasMore => cursor != null;

  CompletedTodosPageState copyWith({List<CompletedTodoEntry>? items, String? cursor, bool? isLoadingMore}) =>
      CompletedTodosPageState(
        items: items ?? this.items,
        cursor: cursor ?? this.cursor,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

class CompletedTodosNotifier extends AsyncNotifier<CompletedTodosPageState> {
  CompletedTodosNotifier(this.query);

  final CompletedTodosQuery query;

  @override
  Future<CompletedTodosPageState> build() async {
    final page = await ref.read(apiClientProvider).listCompletedTodos(search: query.search);
    return CompletedTodosPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref
        .read(apiClientProvider)
        .listCompletedTodos(search: query.search, cursor: current.cursor);
    state = AsyncData(
      CompletedTodosPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final completedTodosProvider =
    AsyncNotifierProvider.autoDispose.family<CompletedTodosNotifier, CompletedTodosPageState, CompletedTodosQuery>(
      CompletedTodosNotifier.new,
    );

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
