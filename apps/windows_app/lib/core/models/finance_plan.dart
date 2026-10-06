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
    this.goals = const [],
  });

  /// 每個目標怎麼存（2026-10-07 起才有）。
  final List<PlanGoal> goals;

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
    goals: (json['goals'] as List<dynamic>? ?? const []).map((e) => PlanGoal.fromJson(e as Map<String, dynamic>)).toList(),
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


/// 每個目標怎麼存（規劃結果）。
class PlanGoal {
  const PlanGoal({
    required this.name,
    required this.amount,
    required this.monthlySaving,
    required this.eta,
    required this.onTrack,
    required this.advice,
  });

  final String name;
  final double amount;
  final double monthlySaving;

  /// 大約哪個月達成（YYYY-MM）。
  final String? eta;
  final bool onTrack;
  final String advice;

  factory PlanGoal.fromJson(Map<String, dynamic> json) => PlanGoal(
    name: json['name'] as String,
    amount: (json['amount'] as num).toDouble(),
    monthlySaving: (json['monthlySaving'] as num? ?? 0).toDouble(),
    eta: json['eta'] as String?,
    onTrack: json['onTrack'] as bool? ?? true,
    advice: json['advice'] as String? ?? '',
  );
}

/// 名稱＋金額（固定支出、其他收入、建議值共用）。
class PlanFixedExpense {
  const PlanFixedExpense({required this.name, required this.amount});

  final String name;
  final double amount;

  factory PlanFixedExpense.fromJson(Map<String, dynamic> json) =>
      PlanFixedExpense(name: json['name'] as String, amount: (json['amount'] as num).toDouble());
}

class PlanAnnualExpense {
  const PlanAnnualExpense({required this.name, required this.amount, this.month});

  final String name;
  final double amount;

  /// 大約幾月（1～12），不知道是 null。
  final int? month;

  factory PlanAnnualExpense.fromJson(Map<String, dynamic> json) => PlanAnnualExpense(
    name: json['name'] as String,
    amount: (json['amount'] as num).toDouble(),
    month: (json['month'] as num?)?.toInt(),
  );

  Map<String, dynamic> toJson() => {'name': name, 'amount': amount, 'month': month};
}

class PlanGoalInput {
  const PlanGoalInput({required this.name, required this.amount, this.targetMonth, this.term = 'mid'});

  final String name;
  final double amount;

  /// YYYY-MM
  final String? targetMonth;

  /// short（1 年內）/ mid（1～5 年）/ long
  final String term;

  factory PlanGoalInput.fromJson(Map<String, dynamic> json) => PlanGoalInput(
    name: json['name'] as String,
    amount: (json['amount'] as num).toDouble(),
    targetMonth: json['targetMonth'] as String?,
    term: json['term'] as String? ?? 'mid',
  );

  Map<String, dynamic> toJson() => {'name': name, 'amount': amount, 'targetMonth': targetMonth, 'term': term};
}

/// 財務規劃問卷的答案（2026-10-07，七大類，後端 finance-plan-profile.ts）。
class FinancePlanAnswers {
  const FinancePlanAnswers({
    this.monthlyIncome,
    this.payDay,
    this.otherIncome = const [],
    this.incomeStability,
    this.incomeChangeNote,
    this.fixedExpenses = const [],
    this.annualExpenses = const [],
    this.livingExpense,
    this.emergencyMonths,
    this.otherAssets,
    this.goals = const [],
    this.savingTarget,
    this.savingRate,
    this.priorities = const [],
    this.riskProfile,
    this.cutBack,
    this.thoughts,
  });

  final double? monthlyIncome;
  final int? payDay;

  /// 其他收入，金額是一年大概多少。
  final List<PlanFixedExpense> otherIncome;

  /// stable / variable / changing
  final String? incomeStability;
  final String? incomeChangeNote;
  final List<PlanFixedExpense> fixedExpenses;
  final List<PlanAnnualExpense> annualExpenses;
  final double? livingExpense;
  final int? emergencyMonths;
  final String? otherAssets;
  final List<PlanGoalInput> goals;
  final double? savingTarget;
  final int? savingRate;

  /// debt / emergency / goals / invest / lifestyle，前面最重要。
  final List<String> priorities;

  /// conservative / balanced / aggressive / none
  final String? riskProfile;
  final String? cutBack;
  final String? thoughts;

  factory FinancePlanAnswers.fromJson(Map<String, dynamic> json) {
    List<Map<String, dynamic>> list(String key) =>
        ((json[key] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>();
    return FinancePlanAnswers(
      monthlyIncome: (json['monthlyIncome'] as num?)?.toDouble(),
      payDay: (json['payDay'] as num?)?.toInt(),
      otherIncome: [
        for (final e in list('otherIncome'))
          PlanFixedExpense(name: e['name'] as String, amount: (e['annualAmount'] as num).toDouble()),
      ],
      incomeStability: json['incomeStability'] as String?,
      incomeChangeNote: json['incomeChangeNote'] as String?,
      fixedExpenses: list('fixedExpenses').map(PlanFixedExpense.fromJson).toList(),
      annualExpenses: list('annualExpenses').map(PlanAnnualExpense.fromJson).toList(),
      livingExpense: (json['livingExpense'] as num?)?.toDouble(),
      emergencyMonths: (json['emergencyMonths'] as num?)?.toInt(),
      otherAssets: json['otherAssets'] as String?,
      goals: list('goals').map(PlanGoalInput.fromJson).toList(),
      savingTarget: (json['savingTarget'] as num?)?.toDouble(),
      savingRate: (json['savingRate'] as num?)?.toInt(),
      priorities: ((json['priorities'] as List<dynamic>?) ?? const []).cast<String>(),
      riskProfile: json['riskProfile'] as String?,
      cutBack: json['cutBack'] as String?,
      thoughts: json['thoughts'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'monthlyIncome': monthlyIncome,
    'payDay': payDay,
    'otherIncome': [for (final e in otherIncome) {'name': e.name, 'annualAmount': e.amount}],
    'incomeStability': incomeStability,
    'incomeChangeNote': incomeChangeNote,
    'fixedExpenses': [for (final e in fixedExpenses) {'name': e.name, 'amount': e.amount}],
    'annualExpenses': [for (final e in annualExpenses) e.toJson()],
    'livingExpense': livingExpense,
    'emergencyMonths': emergencyMonths,
    'otherAssets': otherAssets,
    'goals': [for (final g in goals) g.toJson()],
    'savingTarget': savingTarget,
    'savingRate': savingRate,
    'priorities': priorities,
    'riskProfile': riskProfile,
    'cutBack': cutBack,
    'thoughts': thoughts,
  };
}

/// GET plan/profile：上次的答案（沒填過是 null）＋系統已經知道的建議值。
class FinancePlanProfileForm {
  const FinancePlanProfileForm({
    required this.profile,
    required this.suggestedIncome,
    required this.suggestedPayDay,
    required this.suggestedFixedExpenses,
    required this.suggestedLivingExpense,
    required this.suggestedGoals,
    required this.recordedMonths,
    required this.averageMonthlyIncome,
    required this.averageMonthlyExpense,
    required this.topCategories,
    required this.netWorth,
    required this.stockCost,
    required this.debts,
  });

  final FinancePlanAnswers? profile;
  final double? suggestedIncome;
  final int? suggestedPayDay;
  final List<PlanFixedExpense> suggestedFixedExpenses;
  final double? suggestedLivingExpense;
  final List<PlanGoalInput> suggestedGoals;
  final int recordedMonths;
  final double averageMonthlyIncome;
  final double averageMonthlyExpense;
  final List<PlanFixedExpense> topCategories;
  final double netWorth;
  final double stockCost;

  /// 還沒還完的借入（name＝跟誰借、amount＝還欠多少）。
  final List<PlanFixedExpense> debts;

  factory FinancePlanProfileForm.fromJson(Map<String, dynamic> json) {
    final s = json['suggestions'] as Map<String, dynamic>;
    List<Map<String, dynamic>> list(String key) => ((s[key] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>();
    return FinancePlanProfileForm(
      profile: json['profile'] == null ? null : FinancePlanAnswers.fromJson(json['profile'] as Map<String, dynamic>),
      suggestedIncome: (s['monthlyIncome'] as num?)?.toDouble(),
      suggestedPayDay: (s['payDay'] as num?)?.toInt(),
      suggestedFixedExpenses: list('fixedExpenses').map(PlanFixedExpense.fromJson).toList(),
      suggestedLivingExpense: (s['livingExpense'] as num?)?.toDouble(),
      suggestedGoals: list('goals').map(PlanGoalInput.fromJson).toList(),
      recordedMonths: (s['recordedMonths'] as num? ?? 0).toInt(),
      averageMonthlyIncome: (s['averageMonthlyIncome'] as num? ?? 0).toDouble(),
      averageMonthlyExpense: (s['averageMonthlyExpense'] as num? ?? 0).toDouble(),
      topCategories: [
        for (final m in list('topCategories'))
          PlanFixedExpense(name: m['name'] as String, amount: (m['monthlyAverage'] as num).toDouble()),
      ],
      netWorth: (s['netWorth'] as num? ?? 0).toDouble(),
      stockCost: (s['stockCost'] as num? ?? 0).toDouble(),
      debts: [
        for (final d in list('debts')) PlanFixedExpense(name: d['name'] as String, amount: (d['outstanding'] as num).toDouble()),
      ],
    );
  }
}
