import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/finance.dart';
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

final financeLoansProvider = FutureProvider.autoDispose.family<List<FinanceLoan>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listFinanceLoans(spaceId);
});

final financeAdvancesProvider = FutureProvider.autoDispose.family<List<FinanceAdvance>, String>((
  ref,
  spaceId,
) {
  return ref.read(apiClientProvider).listFinanceAdvances(spaceId);
});

/// Cross-space — every project the user belongs to, for 代墊's optional
/// project picker (see `MyProjectSummary`'s doc comment for why this isn't
/// scoped to one space like `Project` normally is).
final myProjectsProvider = FutureProvider.autoDispose<List<MyProjectSummary>>((ref) {
  return ref.read(apiClientProvider).listMyProjects();
});
