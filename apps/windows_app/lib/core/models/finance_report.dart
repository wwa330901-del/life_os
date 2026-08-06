/// 財務分析報表 (2026-08-06) — see the backend's `FinanceReportService` doc
/// comment for how each section is derived.
class FinanceReport {
  const FinanceReport({
    required this.netWorth,
    required this.savingsRate,
    required this.categoryBreakdown,
    required this.categoryTrend,
    required this.portfolio,
    required this.overspend,
    required this.debts,
    required this.topExpenses,
  });

  final ReportNetWorth netWorth;
  final ReportSavingsRate savingsRate;
  final List<ReportCategoryShare> categoryBreakdown;
  final List<ReportCategoryTrendMonth> categoryTrend;
  final ReportPortfolio portfolio;
  final ReportOverspend overspend;
  final ReportDebts debts;
  final List<ReportTopExpense> topExpenses;

  factory FinanceReport.fromJson(Map<String, dynamic> json) => FinanceReport(
    netWorth: ReportNetWorth.fromJson(json['netWorth'] as Map<String, dynamic>),
    savingsRate: ReportSavingsRate.fromJson(json['savingsRate'] as Map<String, dynamic>),
    categoryBreakdown: (json['categoryBreakdown'] as List<dynamic>)
        .map((e) => ReportCategoryShare.fromJson(e as Map<String, dynamic>))
        .toList(),
    categoryTrend: (json['categoryTrend'] as List<dynamic>)
        .map((e) => ReportCategoryTrendMonth.fromJson(e as Map<String, dynamic>))
        .toList(),
    portfolio: ReportPortfolio.fromJson(json['portfolio'] as Map<String, dynamic>),
    overspend: ReportOverspend.fromJson(json['overspend'] as Map<String, dynamic>),
    debts: ReportDebts.fromJson(json['debts'] as Map<String, dynamic>),
    topExpenses: (json['topExpenses'] as List<dynamic>)
        .map((e) => ReportTopExpense.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class ReportNetWorthPoint {
  const ReportNetWorthPoint({
    required this.date,
    required this.netWorth,
    required this.totalAssets,
    required this.totalLiabilities,
  });

  final String date;
  final double netWorth;
  final double totalAssets;
  final double totalLiabilities;

  factory ReportNetWorthPoint.fromJson(Map<String, dynamic> json) => ReportNetWorthPoint(
    date: json['date'] as String,
    netWorth: (json['netWorth'] as num).toDouble(),
    totalAssets: (json['totalAssets'] as num).toDouble(),
    totalLiabilities: (json['totalLiabilities'] as num).toDouble(),
  );
}

class ReportNetWorth {
  const ReportNetWorth({
    required this.totalAssets,
    required this.totalLiabilities,
    required this.netWorth,
    required this.trend,
  });

  final double totalAssets;
  final double totalLiabilities;
  final double netWorth;
  final List<ReportNetWorthPoint> trend;

  factory ReportNetWorth.fromJson(Map<String, dynamic> json) {
    final current = json['current'] as Map<String, dynamic>;
    return ReportNetWorth(
      totalAssets: (current['totalAssets'] as num).toDouble(),
      totalLiabilities: (current['totalLiabilities'] as num).toDouble(),
      netWorth: (current['netWorth'] as num).toDouble(),
      trend: (json['trend'] as List<dynamic>)
          .map((e) => ReportNetWorthPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class ReportSavingsRate {
  const ReportSavingsRate({
    required this.month,
    required this.totalIncome,
    required this.totalExpense,
    required this.rate,
  });

  final String month;
  final double totalIncome;
  final double totalExpense;

  /// Null when there was no income this month（存不了率）.
  final double? rate;

  factory ReportSavingsRate.fromJson(Map<String, dynamic> json) => ReportSavingsRate(
    month: json['month'] as String,
    totalIncome: (json['totalIncome'] as num).toDouble(),
    totalExpense: (json['totalExpense'] as num).toDouble(),
    rate: json['rate'] == null ? null : (json['rate'] as num).toDouble(),
  );
}

class ReportCategoryShare {
  const ReportCategoryShare({
    required this.categoryId,
    required this.name,
    required this.total,
    required this.percentage,
  });

  final String? categoryId;
  final String name;
  final double total;
  final double percentage;

  factory ReportCategoryShare.fromJson(Map<String, dynamic> json) => ReportCategoryShare(
    categoryId: json['categoryId'] as String?,
    name: json['name'] as String,
    total: (json['total'] as num).toDouble(),
    percentage: (json['percentage'] as num).toDouble(),
  );
}

class ReportCategoryTrendMonth {
  const ReportCategoryTrendMonth({required this.month, required this.categories});

  final String month;
  final List<ReportCategoryShare> categories;

  factory ReportCategoryTrendMonth.fromJson(Map<String, dynamic> json) => ReportCategoryTrendMonth(
    month: json['month'] as String,
    categories: (json['categories'] as List<dynamic>)
        .map((e) => ReportCategoryShare.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class ReportPosition {
  const ReportPosition({
    required this.stockCode,
    required this.stockName,
    required this.marketValue,
    required this.costBasis,
    required this.gainLoss,
    required this.totalReturn,
    required this.annualizedReturn,
    required this.allocation,
  });

  final String stockCode;
  final String? stockName;
  final double marketValue;
  final double costBasis;
  final double gainLoss;
  final double totalReturn;

  /// Null when there's no known holding-start date to annualize from.
  final double? annualizedReturn;
  final double allocation;

  factory ReportPosition.fromJson(Map<String, dynamic> json) => ReportPosition(
    stockCode: json['stockCode'] as String,
    stockName: json['stockName'] as String?,
    marketValue: (json['marketValue'] as num).toDouble(),
    costBasis: (json['costBasis'] as num).toDouble(),
    gainLoss: (json['gainLoss'] as num).toDouble(),
    totalReturn: (json['totalReturn'] as num).toDouble(),
    annualizedReturn: json['annualizedReturn'] == null ? null : (json['annualizedReturn'] as num).toDouble(),
    allocation: (json['allocation'] as num?)?.toDouble() ?? 0,
  );
}

class ReportPortfolio {
  const ReportPortfolio({required this.totalMarketValue, required this.positions});

  final double totalMarketValue;
  final List<ReportPosition> positions;

  factory ReportPortfolio.fromJson(Map<String, dynamic> json) => ReportPortfolio(
    totalMarketValue: (json['totalMarketValue'] as num).toDouble(),
    positions: (json['positions'] as List<dynamic>)
        .map((e) => ReportPosition.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class ReportOverBudgetCategory {
  const ReportOverBudgetCategory({
    required this.categoryName,
    required this.monthlyAmount,
    required this.spent,
    required this.overBy,
  });

  final String categoryName;
  final double monthlyAmount;
  final double spent;
  final double overBy;

  factory ReportOverBudgetCategory.fromJson(Map<String, dynamic> json) => ReportOverBudgetCategory(
    categoryName: json['categoryName'] as String,
    monthlyAmount: (json['monthlyAmount'] as num).toDouble(),
    spent: (json['spent'] as num).toDouble(),
    overBy: (json['overBy'] as num).toDouble(),
  );
}

class ReportOverspend {
  const ReportOverspend({
    required this.overBudget,
    required this.currentMonthExpense,
    required this.previousMonthExpense,
    required this.expenseChange,
  });

  final List<ReportOverBudgetCategory> overBudget;
  final double currentMonthExpense;
  final double previousMonthExpense;

  /// Null when there was no expense last month to compare against.
  final double? expenseChange;

  factory ReportOverspend.fromJson(Map<String, dynamic> json) => ReportOverspend(
    overBudget: (json['overBudget'] as List<dynamic>)
        .map((e) => ReportOverBudgetCategory.fromJson(e as Map<String, dynamic>))
        .toList(),
    currentMonthExpense: (json['currentMonthExpense'] as num).toDouble(),
    previousMonthExpense: (json['previousMonthExpense'] as num).toDouble(),
    expenseChange: json['expenseChange'] == null ? null : (json['expenseChange'] as num).toDouble(),
  );
}

class ReportDebts {
  const ReportDebts({
    required this.owedToMe,
    required this.owedByMe,
    required this.advancesOutstanding,
    required this.loanCount,
    required this.advanceCount,
  });

  final double owedToMe;
  final double owedByMe;
  final double advancesOutstanding;
  final int loanCount;
  final int advanceCount;

  factory ReportDebts.fromJson(Map<String, dynamic> json) => ReportDebts(
    owedToMe: (json['owedToMe'] as num).toDouble(),
    owedByMe: (json['owedByMe'] as num).toDouble(),
    advancesOutstanding: (json['advancesOutstanding'] as num).toDouble(),
    loanCount: json['loanCount'] as int,
    advanceCount: json['advanceCount'] as int,
  );
}

class ReportTopExpense {
  const ReportTopExpense({
    required this.id,
    required this.amount,
    required this.date,
    required this.note,
    required this.categoryName,
  });

  final String id;
  final double amount;
  final DateTime date;
  final String? note;
  final String? categoryName;

  factory ReportTopExpense.fromJson(Map<String, dynamic> json) => ReportTopExpense(
    id: json['id'] as String,
    amount: (json['amount'] as num).toDouble(),
    date: DateTime.parse(json['date'] as String).toLocal(),
    note: json['note'] as String?,
    categoryName: (json['category'] as Map<String, dynamic>?)?['name'] as String?,
  );
}
