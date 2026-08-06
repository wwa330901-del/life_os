import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/finance.dart';
import '../core/models/finance_report.dart';
import '../core/models/project.dart';
import 'auth_provider.dart';

/// This month as `"YYYY-MM"` — the default selection for every 記帳 screen
/// until the user picks a different month.
String currentMonthKey() {
  final now = DateTime.now();
  return '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}';
}

final financeAccountsProvider = FutureProvider.autoDispose.family<List<FinanceAccount>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listFinanceAccounts(spaceId);
});

final financeCategoriesProvider = FutureProvider.autoDispose.family<List<FinanceCategory>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listFinanceCategories(spaceId);
});

/// (spaceId, month) — month null means "every transaction".
typedef FinanceTransactionsQuery = ({String spaceId, String? month});

final financeTransactionsProvider = FutureProvider.autoDispose
    .family<List<FinanceTransaction>, FinanceTransactionsQuery>((ref, query) {
      return ref
          .read(apiClientProvider)
          .listFinanceTransactions(spaceId: query.spaceId, month: query.month);
    });

typedef FinanceMonthQuery = ({String spaceId, String month});

final financeSummaryProvider = FutureProvider.autoDispose
    .family<FinanceMonthlySummary, FinanceMonthQuery>((ref, query) {
      return ref
          .read(apiClientProvider)
          .financeMonthlySummary(spaceId: query.spaceId, month: query.month);
    });

final financeTrendProvider = FutureProvider.autoDispose
    .family<List<FinanceMonthlyTrendPoint>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).financeMonthlyTrend(spaceId: spaceId);
    });

final financeReportProvider = FutureProvider.autoDispose.family<FinanceReport, String>((ref, spaceId) {
  return ref.read(apiClientProvider).financeReport(spaceId);
});

final financeBudgetsProvider = FutureProvider.autoDispose.family<List<FinanceBudget>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listFinanceBudgets(spaceId);
});

final financeBudgetStatusProvider = FutureProvider.autoDispose
    .family<List<FinanceBudgetStatus>, FinanceMonthQuery>((ref, query) {
      return ref
          .read(apiClientProvider)
          .financeBudgetStatus(spaceId: query.spaceId, month: query.month);
    });

final financeRecurringTransactionsProvider = FutureProvider.autoDispose
    .family<List<FinanceRecurringTransaction>, String>((ref, spaceId) {
      return ref.read(apiClientProvider).listFinanceRecurringTransactions(spaceId);
    });

/// (spaceId, settled) — `settled: false`/`true` filters at the query level
/// (backed by the real `settled` column so an old unsettled loan always
/// lands on page 1, see 大系統V1.54.0); `settled: null` = every loan,
/// currently unused but kept for parity with the backend's optional filter.
typedef FinanceLoansQuery = ({String spaceId, bool? settled});

/// Cursor-paginated (30/page) — mirrors `StockTransactionsPageState`'s
/// shape/loadMore pattern.
class FinanceLoansPageState {
  const FinanceLoansPageState({required this.items, required this.cursor, this.isLoadingMore = false});

  final List<FinanceLoan> items;
  final String? cursor;
  final bool isLoadingMore;

  bool get hasMore => cursor != null;

  FinanceLoansPageState copyWith({List<FinanceLoan>? items, String? cursor, bool? isLoadingMore}) =>
      FinanceLoansPageState(
        items: items ?? this.items,
        cursor: cursor ?? this.cursor,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      );
}

class FinanceLoansNotifier extends AsyncNotifier<FinanceLoansPageState> {
  FinanceLoansNotifier(this.query);

  final FinanceLoansQuery query;

  @override
  Future<FinanceLoansPageState> build() async {
    final page = await ref
        .read(apiClientProvider)
        .listFinanceLoans(query.spaceId, settled: query.settled);
    return FinanceLoansPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref
        .read(apiClientProvider)
        .listFinanceLoans(query.spaceId, settled: query.settled, cursor: current.cursor);
    state = AsyncData(
      FinanceLoansPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final financeLoansProvider =
    AsyncNotifierProvider.autoDispose.family<FinanceLoansNotifier, FinanceLoansPageState, FinanceLoansQuery>(
      FinanceLoansNotifier.new,
    );

final financeLoanInvitesReceivedProvider = FutureProvider.autoDispose<List<FinanceLoanInvite>>((ref) {
  return ref.read(apiClientProvider).listReceivedFinanceLoanInvites();
});

/// (spaceId, settled) — same shape/reasoning as [FinanceLoansQuery].
typedef FinanceAdvancesQuery = ({String spaceId, bool? settled});

/// Cursor-paginated (30/page) — mirrors [FinanceLoansPageState].
class FinanceAdvancesPageState {
  const FinanceAdvancesPageState({required this.items, required this.cursor, this.isLoadingMore = false});

  final List<FinanceAdvance> items;
  final String? cursor;
  final bool isLoadingMore;

  bool get hasMore => cursor != null;

  FinanceAdvancesPageState copyWith({
    List<FinanceAdvance>? items,
    String? cursor,
    bool? isLoadingMore,
  }) => FinanceAdvancesPageState(
    items: items ?? this.items,
    cursor: cursor ?? this.cursor,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
  );
}

class FinanceAdvancesNotifier extends AsyncNotifier<FinanceAdvancesPageState> {
  FinanceAdvancesNotifier(this.query);

  final FinanceAdvancesQuery query;

  @override
  Future<FinanceAdvancesPageState> build() async {
    final page = await ref
        .read(apiClientProvider)
        .listFinanceAdvances(query.spaceId, settled: query.settled);
    return FinanceAdvancesPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref
        .read(apiClientProvider)
        .listFinanceAdvances(query.spaceId, settled: query.settled, cursor: current.cursor);
    state = AsyncData(
      FinanceAdvancesPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final financeAdvancesProvider = AsyncNotifierProvider.autoDispose
    .family<FinanceAdvancesNotifier, FinanceAdvancesPageState, FinanceAdvancesQuery>(
      FinanceAdvancesNotifier.new,
    );

/// Cross-space — every project the user belongs to, for 代墊's optional
/// project picker (see `MyProjectSummary`'s doc comment for why this isn't
/// scoped to one space like `Project` normally is).
final myProjectsProvider = FutureProvider.autoDispose<List<MyProjectSummary>>((ref) {
  return ref.read(apiClientProvider).listMyProjects();
});
