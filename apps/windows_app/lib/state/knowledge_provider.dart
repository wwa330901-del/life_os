import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/knowledge.dart';
import 'auth_provider.dart';

/// The caller's own knowledge categories (私人區), including their own
/// public ones — an owner always sees 100% of their own stuff regardless
/// of the `isPublic` flag.
final knowledgeCategoriesProvider = FutureProvider.autoDispose<List<KnowledgeCategory>>((ref) {
  return ref.read(apiClientProvider).listKnowledgeCategories();
});

/// Other users' public categories the caller isn't blacklisted from (公開區).
final publicKnowledgeCategoriesProvider = FutureProvider.autoDispose<List<KnowledgeCategory>>((ref) {
  return ref.read(apiClientProvider).listPublicKnowledgeCategories();
});

typedef KnowledgeItemsQuery = ({String? categoryId, String? search});

/// One filter's worth of loaded pages — items accumulate as `loadMore()` is
/// called; `hasMore` gates further loading and drives the infinite-scroll
/// trigger in the tab screens. Switching `categoryId`/`search` creates a
/// fresh family instance (and so a fresh first page), same as the old
/// `FutureProvider.family` this replaces.
class KnowledgeItemsPageState {
  const KnowledgeItemsPageState({required this.items, required this.cursor, this.isLoadingMore = false});

  final List<KnowledgeItem> items;
  final String? cursor;
  final bool isLoadingMore;

  bool get hasMore => cursor != null;

  KnowledgeItemsPageState copyWith({List<KnowledgeItem>? items, String? cursor, bool? isLoadingMore}) =>
      KnowledgeItemsPageState(
        items: items ?? this.items,
        cursor: cursor ?? this.cursor,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

class KnowledgeItemsNotifier extends AsyncNotifier<KnowledgeItemsPageState> {
  KnowledgeItemsNotifier(this.query);

  final KnowledgeItemsQuery query;

  @override
  Future<KnowledgeItemsPageState> build() async {
    final page = await ref
        .read(apiClientProvider)
        .listKnowledgeItems(categoryId: query.categoryId, search: query.search);
    return KnowledgeItemsPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref
        .read(apiClientProvider)
        .listKnowledgeItems(categoryId: query.categoryId, search: query.search, cursor: current.cursor);
    state = AsyncData(
      KnowledgeItemsPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final knowledgeItemsProvider =
    AsyncNotifierProvider.autoDispose.family<KnowledgeItemsNotifier, KnowledgeItemsPageState, KnowledgeItemsQuery>(
      KnowledgeItemsNotifier.new,
    );

class PublicKnowledgeItemsNotifier extends AsyncNotifier<KnowledgeItemsPageState> {
  PublicKnowledgeItemsNotifier(this.query);

  final KnowledgeItemsQuery query;

  @override
  Future<KnowledgeItemsPageState> build() async {
    final page = await ref
        .read(apiClientProvider)
        .listPublicKnowledgeItems(categoryId: query.categoryId, search: query.search);
    return KnowledgeItemsPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref
        .read(apiClientProvider)
        .listPublicKnowledgeItems(categoryId: query.categoryId, search: query.search, cursor: current.cursor);
    state = AsyncData(
      KnowledgeItemsPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final publicKnowledgeItemsProvider =
    AsyncNotifierProvider.autoDispose
        .family<PublicKnowledgeItemsNotifier, KnowledgeItemsPageState, KnowledgeItemsQuery>(
          PublicKnowledgeItemsNotifier.new,
        );

final knowledgeItemDetailProvider = FutureProvider.autoDispose.family<KnowledgeItem, String>((ref, itemId) {
  return ref.read(apiClientProvider).getKnowledgeItem(itemId);
});

/// 知識庫 is account-level, not a Space — this is a separate top-level
/// destination from `selectedSpaceProvider`, checked first by `_RootRouter`
/// (`app.dart`) so it's reachable directly from the space picker without
/// going through any particular space's shell/sidebar.
class ShowKnowledgeLibraryNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void open() => state = true;

  void close() => state = false;
}

final showKnowledgeLibraryProvider = NotifierProvider<ShowKnowledgeLibraryNotifier, bool>(
  ShowKnowledgeLibraryNotifier.new,
);
