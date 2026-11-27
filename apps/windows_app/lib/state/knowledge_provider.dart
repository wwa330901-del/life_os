import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/knowledge.dart';
import '../core/models/knowledge_brain.dart';
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


// ---------- 知識庫大腦（2026-11-27）----------

final brainOverviewProvider = FutureProvider.autoDispose<BrainOverview>((ref) {
  return ref.read(apiClientProvider).getBrainOverview();
});

/// 首頁「從大腦翻出來的」：autoDispose，每次回到首頁重新抽一次。
final brainRandomProvider = FutureProvider.autoDispose<List<BrainRandomItem>>((ref) {
  return ref.read(apiClientProvider).getBrainRandom();
});

final brainGraphProvider = FutureProvider.autoDispose<BrainGraph>((ref) {
  return ref.read(apiClientProvider).getBrainGraph();
});

final brainConnectionsProvider = FutureProvider.autoDispose.family<BrainConnections, String>((ref, itemId) {
  return ref.read(apiClientProvider).getBrainConnections(itemId);
});

final brainTopicProvider = FutureProvider.autoDispose.family<BrainTopicDetail, String>((ref, topicId) {
  return ref.read(apiClientProvider).getBrainTopic(topicId);
});

/// 大腦有變動（看過、刪除、改主題）後，首頁、地圖、列表一起重新讀。
void refreshBrain(WidgetRef ref) {
  ref.invalidate(brainOverviewProvider);
  ref.invalidate(brainGraphProvider);
  ref.invalidate(knowledgeItemsProvider);
}
