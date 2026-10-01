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
