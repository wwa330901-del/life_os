/// 財務規劃（AI 結構化結果，後端 finance-plan-format.ts）。
class FinancePlan {
  const FinancePlan({
    required this.summary,
    required this.monthlyIncome,
    required this.allocation,
    required this.budgets,
    required this.steps,
    required this.generatedAt,
    this.wishlistAdvice,
  });

  final String summary;
  final double monthlyIncome;
  final List<PlanAllocation> allocation;
  final List<PlanBudget> budgets;
  final List<String> steps;
  final String? wishlistAdvice;
  final DateTime generatedAt;

  factory FinancePlan.fromJson(Map<String, dynamic> json) => FinancePlan(
    summary: json['summary'] as String? ?? '',
    monthlyIncome: (json['monthlyIncome'] as num? ?? 0).toDouble(),
    allocation: (json['allocation'] as List<dynamic>? ?? const [])
        .map((e) => PlanAllocation.fromJson(e as Map<String, dynamic>))
        .toList(),
    budgets: (json['budgets'] as List<dynamic>? ?? const []).map((e) => PlanBudget.fromJson(e as Map<String, dynamic>)).toList(),
    steps: (json['steps'] as List<dynamic>? ?? const []).cast<String>(),
    wishlistAdvice: json['wishlistAdvice'] as String?,
    generatedAt: DateTime.parse(json['generatedAt'] as String).toLocal(),
  );
}

class PlanAllocation {
  const PlanAllocation({required this.name, required this.amount, required this.percent, required this.reason});

  final String name;
  final double amount;
  final int percent;
  final String reason;

  factory PlanAllocation.fromJson(Map<String, dynamic> json) => PlanAllocation(
    name: json['name'] as String,
    amount: (json['amount'] as num).toDouble(),
    percent: (json['percent'] as num).round(),
    reason: json['reason'] as String? ?? '',
  );
}

class PlanBudget {
  const PlanBudget({required this.category, required this.amount, required this.reason, this.currentAverage});

  final String category;
  final double amount;
  final double? currentAverage;
  final String reason;

  factory PlanBudget.fromJson(Map<String, dynamic> json) => PlanBudget(
    category: json['category'] as String,
    amount: (json['amount'] as num).toDouble(),
    currentAverage: (json['currentAverage'] as num?)?.toDouble(),
    reason: json['reason'] as String? ?? '',
  );
}

/// 財務規劃前問的：每月收入、固定支出、想法目標（2026-10-07）。
class FinancePlanAnswers {
  const FinancePlanAnswers({required this.monthlyIncome, required this.fixedExpenses, required this.thoughts});

  final double? monthlyIncome;
  final List<PlanFixedExpense> fixedExpenses;
  final String? thoughts;

  factory FinancePlanAnswers.fromJson(Map<String, dynamic> json) => FinancePlanAnswers(
    monthlyIncome: (json['monthlyIncome'] as num?)?.toDouble(),
    fixedExpenses: ((json['fixedExpenses'] as List<dynamic>?) ?? const [])
        .map((e) => PlanFixedExpense.fromJson(e as Map<String, dynamic>))
        .toList(),
    thoughts: json['thoughts'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'monthlyIncome': monthlyIncome,
    'fixedExpenses': [for (final e in fixedExpenses) {'name': e.name, 'amount': e.amount}],
    'thoughts': thoughts,
  };
}

class PlanFixedExpense {
  const PlanFixedExpense({required this.name, required this.amount});

  final String name;
  final double amount;

  factory PlanFixedExpense.fromJson(Map<String, dynamic> json) =>
      PlanFixedExpense(name: json['name'] as String, amount: (json['amount'] as num).toDouble());
}

/// GET plan/profile：上次的答案（沒問過是 null）＋記帳抓的建議值。
class FinancePlanProfileForm {
  const FinancePlanProfileForm({
    required this.profile,
    required this.suggestedIncome,
    required this.suggestedFixedExpenses,
    required this.recordedMonths,
    required this.averageMonthlyIncome,
    required this.averageMonthlyExpense,
    required this.topCategories,
  });

  final FinancePlanAnswers? profile;
  final double? suggestedIncome;
  final List<PlanFixedExpense> suggestedFixedExpenses;
  final int recordedMonths;
  final double averageMonthlyIncome;
  final double averageMonthlyExpense;
  final List<PlanFixedExpense> topCategories;

  factory FinancePlanProfileForm.fromJson(Map<String, dynamic> json) {
    final s = json['suggestions'] as Map<String, dynamic>;
    return FinancePlanProfileForm(
      profile: json['profile'] == null ? null : FinancePlanAnswers.fromJson(json['profile'] as Map<String, dynamic>),
      suggestedIncome: (s['monthlyIncome'] as num?)?.toDouble(),
      suggestedFixedExpenses: (s['fixedExpenses'] as List<dynamic>)
          .map((e) => PlanFixedExpense.fromJson(e as Map<String, dynamic>))
          .toList(),
      recordedMonths: (s['recordedMonths'] as num).toInt(),
      averageMonthlyIncome: (s['averageMonthlyIncome'] as num).toDouble(),
      averageMonthlyExpense: (s['averageMonthlyExpense'] as num).toDouble(),
      topCategories: (s['topCategories'] as List<dynamic>)
          .map((e) {
            final m = e as Map<String, dynamic>;
            return PlanFixedExpense(name: m['name'] as String, amount: (m['monthlyAverage'] as num).toDouble());
          })
          .toList(),
    );
  }
}
