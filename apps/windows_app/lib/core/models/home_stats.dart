/// 首頁統計小工具（2026-11-21 使用者要的）：預算進度、財務健檢＋淨資產走勢、
/// 每月固定的扣款狀態。後端各自出錯會給 null，畫面顯示「暫時沒有資料」。
library;

double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

class HomeBudgetItem {
  const HomeBudgetItem({required this.categoryName, required this.budget, required this.spent});

  final String categoryName;
  final double budget;
  final double spent;

  double get ratio => budget <= 0 ? 0 : spent / budget;

  factory HomeBudgetItem.fromJson(Map<String, dynamic> json) => HomeBudgetItem(
    categoryName: json['categoryName'] as String,
    budget: _num(json['budget']),
    spent: _num(json['spent']),
  );
}

class HomeBudgetProgress {
  const HomeBudgetProgress({required this.month, required this.items});

  final String month;
  final List<HomeBudgetItem> items;

  factory HomeBudgetProgress.fromJson(Map<String, dynamic> json) => HomeBudgetProgress(
    month: json['month'] as String,
    items: (json['items'] as List<dynamic>).map((e) => HomeBudgetItem.fromJson(e as Map<String, dynamic>)).toList(),
  );
}

class HomeNetWorthPoint {
  const HomeNetWorthPoint({required this.date, required this.netWorth});

  final DateTime date;
  final double netWorth;

  factory HomeNetWorthPoint.fromJson(Map<String, dynamic> json) =>
      HomeNetWorthPoint(date: DateTime.parse(json['date'] as String), netWorth: _num(json['netWorth']));
}

class HomeFinancialHealth {
  const HomeFinancialHealth({required this.score, required this.grade, required this.netWorth, required this.trend});

  final double score;
  final String grade;
  final double? netWorth;
  final List<HomeNetWorthPoint> trend;

  factory HomeFinancialHealth.fromJson(Map<String, dynamic> json) => HomeFinancialHealth(
    score: _num(json['score']),
    grade: json['grade'] as String? ?? '',
    netWorth: (json['netWorth'] as num?)?.toDouble(),
    trend: (json['trend'] as List<dynamic>).map((e) => HomeNetWorthPoint.fromJson(e as Map<String, dynamic>)).toList(),
  );
}

class HomeRecurringItem {
  const HomeRecurringItem({
    required this.label,
    required this.type,
    required this.amount,
    required this.accountName,
    required this.firedThisMonth,
    required this.thisMonthDate,
    required this.nextDate,
  });

  final String label;
  final String type;
  final double? amount;
  final String accountName;
  final bool firedThisMonth;
  final DateTime thisMonthDate;
  final DateTime nextDate;

  factory HomeRecurringItem.fromJson(Map<String, dynamic> json) => HomeRecurringItem(
    label: json['label'] as String,
    type: json['type'] as String,
    amount: (json['amount'] as num?)?.toDouble(),
    accountName: json['accountName'] as String,
    firedThisMonth: json['firedThisMonth'] as bool? ?? false,
    thisMonthDate: DateTime.parse(json['thisMonthDate'] as String),
    nextDate: DateTime.parse(json['nextDate'] as String),
  );
}

class HomeReconciliationRef {
  const HomeReconciliationRef({required this.date, required this.accountName, required this.difference});

  final DateTime date;
  final String accountName;
  final double difference;

  factory HomeReconciliationRef.fromJson(Map<String, dynamic> json) => HomeReconciliationRef(
    date: DateTime.parse(json['date'] as String),
    accountName: json['accountName'] as String,
    difference: _num(json['difference']),
  );
}

class HomeRecurringStatus {
  const HomeRecurringStatus({required this.items, required this.recentReconciliations});

  final List<HomeRecurringItem> items;
  final List<HomeReconciliationRef> recentReconciliations;

  factory HomeRecurringStatus.fromJson(Map<String, dynamic> json) => HomeRecurringStatus(
    items: (json['items'] as List<dynamic>).map((e) => HomeRecurringItem.fromJson(e as Map<String, dynamic>)).toList(),
    recentReconciliations: ((json['recentReconciliations'] as List<dynamic>?) ?? const [])
        .map((e) => HomeReconciliationRef.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
