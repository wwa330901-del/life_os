import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/stock.dart';
import 'auth_provider.dart';

final stockHoldingsProvider = FutureProvider.autoDispose.family<List<StockHolding>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listStockHoldings(spaceId);
});

/// Cursor-paginated (30/page) — mirrors `KnowledgeItemsPageState`'s
/// shape/loadMore pattern (see 大系統V1.43.0), duplicated locally rather
/// than shared.
class StockTransactionsPageState {
  const StockTransactionsPageState({required this.items, required this.cursor, this.isLoadingMore = false});

  final List<StockTransaction> items;
  final String? cursor;
  final bool isLoadingMore;

  bool get hasMore => cursor != null;

  StockTransactionsPageState copyWith({List<StockTransaction>? items, String? cursor, bool? isLoadingMore}) =>
      StockTransactionsPageState(
        items: items ?? this.items,
        cursor: cursor ?? this.cursor,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

class StockTransactionsNotifier extends AsyncNotifier<StockTransactionsPageState> {
  StockTransactionsNotifier(this.spaceId);

  final String spaceId;

  @override
  Future<StockTransactionsPageState> build() async {
    final page = await ref.read(apiClientProvider).listStockTransactions(spaceId);
    return StockTransactionsPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref.read(apiClientProvider).listStockTransactions(spaceId, cursor: current.cursor);
    state = AsyncData(
      StockTransactionsPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final stockTransactionsProvider =
    AsyncNotifierProvider.autoDispose.family<StockTransactionsNotifier, StockTransactionsPageState, String>(
      StockTransactionsNotifier.new,
    );

final stockRecurringInvestmentsProvider = FutureProvider.autoDispose
    .family<List<StockRecurringInvestment>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).listStockRecurringInvestments(spaceId);
    });
