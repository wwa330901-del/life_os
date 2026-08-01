import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/stock.dart';
import 'auth_provider.dart';

final stockHoldingsProvider = FutureProvider.autoDispose.family<List<StockHolding>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listStockHoldings(spaceId);
});

final stockTransactionsProvider = FutureProvider.autoDispose.family<List<StockTransaction>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listStockTransactions(spaceId);
});

final stockRecurringInvestmentsProvider = FutureProvider.autoDispose
    .family<List<StockRecurringInvestment>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).listStockRecurringInvestments(spaceId);
    });
