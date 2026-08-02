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

final knowledgeItemsProvider = FutureProvider.autoDispose.family<List<KnowledgeItem>, KnowledgeItemsQuery>((
  ref,
  query,
) {
  return ref.read(apiClientProvider).listKnowledgeItems(categoryId: query.categoryId, search: query.search);
});

final publicKnowledgeItemsProvider = FutureProvider.autoDispose.family<List<KnowledgeItem>, KnowledgeItemsQuery>((
  ref,
  query,
) {
  return ref.read(apiClientProvider).listPublicKnowledgeItems(categoryId: query.categoryId, search: query.search);
});

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
