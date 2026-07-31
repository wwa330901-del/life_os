enum FinanceAccountType { cash, bank, creditCard, other }

extension FinanceAccountTypeJson on FinanceAccountType {
  static FinanceAccountType fromJson(String value) => switch (value) {
    'CASH' => FinanceAccountType.cash,
    'BANK' => FinanceAccountType.bank,
    'CREDIT_CARD' => FinanceAccountType.creditCard,
    _ => FinanceAccountType.other,
  };

  String toJson() => switch (this) {
    FinanceAccountType.cash => 'CASH',
    FinanceAccountType.bank => 'BANK',
    FinanceAccountType.creditCard => 'CREDIT_CARD',
    FinanceAccountType.other => 'OTHER',
  };

  String get label => switch (this) {
    FinanceAccountType.cash => '現金',
    FinanceAccountType.bank => '銀行',
    FinanceAccountType.creditCard => '信用卡',
    FinanceAccountType.other => '其他',
  };
}

enum FinanceCategoryKind { income, expense }

extension FinanceCategoryKindJson on FinanceCategoryKind {
  static FinanceCategoryKind fromJson(String value) =>
      value == 'INCOME' ? FinanceCategoryKind.income : FinanceCategoryKind.expense;

  String toJson() => this == FinanceCategoryKind.income ? 'INCOME' : 'EXPENSE';

  String get label => this == FinanceCategoryKind.income ? '收入' : '支出';
}

enum FinanceTransactionType { income, expense, transfer }

extension FinanceTransactionTypeJson on FinanceTransactionType {
  static FinanceTransactionType fromJson(String value) => switch (value) {
    'INCOME' => FinanceTransactionType.income,
    'EXPENSE' => FinanceTransactionType.expense,
    _ => FinanceTransactionType.transfer,
  };

  String toJson() => switch (this) {
    FinanceTransactionType.income => 'INCOME',
    FinanceTransactionType.expense => 'EXPENSE',
    FinanceTransactionType.transfer => 'TRANSFER',
  };

  String get label => switch (this) {
    FinanceTransactionType.income => '收入',
    FinanceTransactionType.expense => '支出',
    FinanceTransactionType.transfer => '轉帳',
  };
}

/// Whether a 定期交易 whose trigger date lands on a weekend or Taiwan
/// government holiday should shift earlier/later to the nearest working day.
enum FinanceRecurringHolidayAdjustment { none, earlier, later }

extension FinanceRecurringHolidayAdjustmentJson on FinanceRecurringHolidayAdjustment {
  static FinanceRecurringHolidayAdjustment fromJson(String value) => switch (value) {
    'EARLIER' => FinanceRecurringHolidayAdjustment.earlier,
    'LATER' => FinanceRecurringHolidayAdjustment.later,
    _ => FinanceRecurringHolidayAdjustment.none,
  };

  String toJson() => switch (this) {
    FinanceRecurringHolidayAdjustment.none => 'NONE',
    FinanceRecurringHolidayAdjustment.earlier => 'EARLIER',
    FinanceRecurringHolidayAdjustment.later => 'LATER',
  };

  String get label => switch (this) {
    FinanceRecurringHolidayAdjustment.none => '不調整',
    FinanceRecurringHolidayAdjustment.earlier => '提前到平日',
    FinanceRecurringHolidayAdjustment.later => '延後到平日',
  };
}

/// A 記帳 money container (現金/銀行/信用卡/其他) — `balance` is the server's
/// derived running total (initialBalance plus every transaction against
/// it), never computed on the client.
class FinanceAccount {
  const FinanceAccount({
    required this.id,
    required this.name,
    required this.type,
    required this.initialBalance,
    required this.balance,
    required this.sortOrder,
  });

  final String id;
  final String name;
  final FinanceAccountType type;
  final double initialBalance;
  final double balance;
  final int sortOrder;

  factory FinanceAccount.fromJson(Map<String, dynamic> json) => FinanceAccount(
    id: json['id'] as String,
    name: json['name'] as String,
    type: FinanceAccountTypeJson.fromJson(json['type'] as String),
    initialBalance: (json['initialBalance'] as num).toDouble(),
    balance: (json['balance'] as num).toDouble(),
    sortOrder: json['sortOrder'] as int,
  );
}

/// 母分類/子分類 — exactly two levels. [parentId] null means this *is* a
/// 母分類; set means this is a 子分類 under that parent. A 母分類 that has
/// at least one child can no longer be picked directly on a transaction
/// (see `FinanceCategoryTree.hasChildren`) — the child is the real
/// classification, the parent is just the rollup grouping shown in
/// 總覽/報表/預算.
class FinanceCategory {
  const FinanceCategory({
    required this.id,
    required this.name,
    required this.kind,
    required this.sortOrder,
    this.parentId,
  });

  final String id;
  final String name;
  final FinanceCategoryKind kind;
  final int sortOrder;
  final String? parentId;

  factory FinanceCategory.fromJson(Map<String, dynamic> json) => FinanceCategory(
    id: json['id'] as String,
    name: json['name'] as String,
    kind: FinanceCategoryKindJson.fromJson(json['kind'] as String),
    sortOrder: json['sortOrder'] as int,
    parentId: json['parentId'] as String?,
  );
}

/// Read-only helpers for working with a flat [FinanceCategory] list as a
/// two-level tree, without needing a separate tree-shaped model.
extension FinanceCategoryTree on List<FinanceCategory> {
  List<FinanceCategory> get topLevel => where((c) => c.parentId == null).toList();

  List<FinanceCategory> childrenOf(String parentId) =>
      where((c) => c.parentId == parentId).toList();

  bool hasChildren(String categoryId) => any((c) => c.parentId == categoryId);

  /// Categories that can actually be picked on a transaction — a 母分類
  /// with children is excluded (its child is the real classification).
  List<FinanceCategory> get leaves => where((c) => !hasChildren(c.id)).toList();
}

class FinanceTransaction {
  const FinanceTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.accountId,
    required this.toAccountId,
    required this.categoryId,
    required this.date,
    required this.note,
  });

  final String id;
  final FinanceTransactionType type;
  final double amount;
  final String accountId;
  final String? toAccountId;
  final String? categoryId;
  final DateTime date;
  final String? note;

  factory FinanceTransaction.fromJson(Map<String, dynamic> json) => FinanceTransaction(
    id: json['id'] as String,
    type: FinanceTransactionTypeJson.fromJson(json['type'] as String),
    amount: (json['amount'] as num).toDouble(),
    accountId: json['accountId'] as String,
    toAccountId: json['toAccountId'] as String?,
    categoryId: json['categoryId'] as String?,
    date: DateTime.parse(json['date'] as String),
    note: json['note'] as String?,
  );
}

class FinanceCategorySummary {
  const FinanceCategorySummary({
    required this.categoryId,
    required this.name,
    required this.kind,
    required this.total,
  });

  final String? categoryId;
  final String name;
  final FinanceTransactionType kind;
  final double total;

  factory FinanceCategorySummary.fromJson(Map<String, dynamic> json) => FinanceCategorySummary(
    categoryId: json['categoryId'] as String?,
    name: json['name'] as String,
    kind: FinanceTransactionTypeJson.fromJson(json['kind'] as String),
    total: (json['total'] as num).toDouble(),
  );
}

class FinanceMonthlySummary {
  const FinanceMonthlySummary({
    required this.month,
    required this.totalIncome,
    required this.totalExpense,
    required this.net,
    required this.byCategory,
  });

  final String month;
  final double totalIncome;
  final double totalExpense;
  final double net;
  final List<FinanceCategorySummary> byCategory;

  factory FinanceMonthlySummary.fromJson(Map<String, dynamic> json) => FinanceMonthlySummary(
    month: json['month'] as String,
    totalIncome: (json['totalIncome'] as num).toDouble(),
    totalExpense: (json['totalExpense'] as num).toDouble(),
    net: (json['net'] as num).toDouble(),
    byCategory: (json['byCategory'] as List<dynamic>)
        .map((e) => FinanceCategorySummary.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class FinanceBudget {
  const FinanceBudget({
    required this.id,
    required this.categoryId,
    required this.categoryName,
    required this.monthlyAmount,
  });

  final String id;
  final String categoryId;
  final String categoryName;
  final double monthlyAmount;

  factory FinanceBudget.fromJson(Map<String, dynamic> json) => FinanceBudget(
    id: json['id'] as String,
    categoryId: json['categoryId'] as String,
    categoryName: (json['category'] as Map<String, dynamic>)['name'] as String,
    monthlyAmount: (json['monthlyAmount'] as num).toDouble(),
  );
}

/// A "every month on day N, do this" entry. [amount] left null means a
/// variable amount (a credit card bill that's a different number every
/// month) — the due day just sends a LINE reminder; set means a fixed
/// amount (rent, subscriptions) — the due day auto-records the transaction
/// and sends a LINE notification saying so.
class FinanceRecurringTransaction {
  const FinanceRecurringTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.accountId,
    required this.toAccountId,
    required this.categoryId,
    required this.dayOfMonth,
    required this.holidayAdjustment,
    required this.active,
    required this.note,
  });

  final String id;
  final FinanceTransactionType type;
  final double? amount;
  final String accountId;
  final String? toAccountId;
  final String? categoryId;
  final int dayOfMonth;
  final FinanceRecurringHolidayAdjustment holidayAdjustment;
  final bool active;
  final String? note;

  factory FinanceRecurringTransaction.fromJson(Map<String, dynamic> json) => FinanceRecurringTransaction(
    id: json['id'] as String,
    type: FinanceTransactionTypeJson.fromJson(json['type'] as String),
    amount: (json['amount'] as num?)?.toDouble(),
    accountId: json['accountId'] as String,
    toAccountId: json['toAccountId'] as String?,
    categoryId: json['categoryId'] as String?,
    dayOfMonth: json['dayOfMonth'] as int,
    holidayAdjustment: FinanceRecurringHolidayAdjustmentJson.fromJson(json['holidayAdjustment'] as String),
    active: json['active'] as bool,
    note: json['note'] as String?,
  );
}

class FinanceBudgetStatus {
  const FinanceBudgetStatus({
    required this.categoryId,
    required this.categoryName,
    required this.monthlyAmount,
    required this.spent,
  });

  final String categoryId;
  final String categoryName;
  final double monthlyAmount;
  final double spent;

  factory FinanceBudgetStatus.fromJson(Map<String, dynamic> json) => FinanceBudgetStatus(
    categoryId: json['categoryId'] as String,
    categoryName: json['categoryName'] as String,
    monthlyAmount: (json['monthlyAmount'] as num).toDouble(),
    spent: (json['spent'] as num).toDouble(),
  );
}
