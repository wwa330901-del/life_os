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

// loanOut/loanIn/advanceOut/advanceIn are real cash moves (借貸/代墊 — see
// FinanceLoan/FinanceAdvance on the backend) that show up in the general
// transaction list like any other entry, but never count toward
// 收入/支出 totals — same reasoning as transfer.
enum FinanceTransactionType { income, expense, transfer, loanOut, loanIn, advanceOut, advanceIn }

extension FinanceTransactionTypeJson on FinanceTransactionType {
  static FinanceTransactionType fromJson(String value) => switch (value) {
    'INCOME' => FinanceTransactionType.income,
    'EXPENSE' => FinanceTransactionType.expense,
    'LOAN_OUT' => FinanceTransactionType.loanOut,
    'LOAN_IN' => FinanceTransactionType.loanIn,
    'ADVANCE_OUT' => FinanceTransactionType.advanceOut,
    'ADVANCE_IN' => FinanceTransactionType.advanceIn,
    _ => FinanceTransactionType.transfer,
  };

  String toJson() => switch (this) {
    FinanceTransactionType.income => 'INCOME',
    FinanceTransactionType.expense => 'EXPENSE',
    FinanceTransactionType.transfer => 'TRANSFER',
    FinanceTransactionType.loanOut => 'LOAN_OUT',
    FinanceTransactionType.loanIn => 'LOAN_IN',
    FinanceTransactionType.advanceOut => 'ADVANCE_OUT',
    FinanceTransactionType.advanceIn => 'ADVANCE_IN',
  };

  String get label => switch (this) {
    FinanceTransactionType.income => '收入',
    FinanceTransactionType.expense => '支出',
    FinanceTransactionType.transfer => '轉帳',
    FinanceTransactionType.loanOut => '借出',
    FinanceTransactionType.loanIn => '借入/收回借款',
    FinanceTransactionType.advanceOut => '代墊支出',
    FinanceTransactionType.advanceIn => '收回代墊',
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

/// One month's income/expense totals — one entry of the 財務總覽 report's
/// 近6個月收支趨勢 chart (`GET .../finance/transactions/trend`).
class FinanceMonthlyTrendPoint {
  const FinanceMonthlyTrendPoint({required this.month, required this.totalIncome, required this.totalExpense});

  final String month;
  final double totalIncome;
  final double totalExpense;

  factory FinanceMonthlyTrendPoint.fromJson(Map<String, dynamic> json) => FinanceMonthlyTrendPoint(
    month: json['month'] as String,
    totalIncome: (json['totalIncome'] as num).toDouble(),
    totalExpense: (json['totalExpense'] as num).toDouble(),
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

enum FinanceLoanDirection { lend, borrow }

extension FinanceLoanDirectionJson on FinanceLoanDirection {
  static FinanceLoanDirection fromJson(String value) =>
      value == 'LEND' ? FinanceLoanDirection.lend : FinanceLoanDirection.borrow;

  String toJson() => this == FinanceLoanDirection.lend ? 'LEND' : 'BORROW';

  String get label => this == FinanceLoanDirection.lend ? '借出' : '借入';
}

/// One repayment entry against a [FinanceLoan] or [FinanceAdvance] —
/// amount/date/account/note all live on the linked `FinanceTransaction`
/// row backend-side (see the schema doc comment), flattened here since the
/// App never needs to distinguish "the repayment record" from "its
/// transaction" the way the backend's FK relationship does.
class FinanceSettlementEntry {
  const FinanceSettlementEntry({
    required this.id,
    required this.amount,
    required this.date,
    required this.accountId,
    this.note,
  });

  final String id;
  final double amount;
  final DateTime date;
  final String accountId;
  final String? note;

  factory FinanceSettlementEntry.fromJson(Map<String, dynamic> json) {
    final transaction = json['transaction'] as Map<String, dynamic>;
    return FinanceSettlementEntry(
      id: json['id'] as String,
      amount: (transaction['amount'] as num).toDouble(),
      date: DateTime.parse(transaction['date'] as String),
      accountId: transaction['accountId'] as String,
      note: transaction['note'] as String?,
    );
  }
}

/// 跟人借錢/借錢給人 — [amount]/[date]/[accountId]/[note] are the *initial*
/// cash move (from the backend's `initialTransaction`); [outstanding]/
/// [settled] are always server-computed (principal minus repayments so
/// far), never something the App itself sums up.
class FinanceLoan {
  const FinanceLoan({
    required this.id,
    required this.direction,
    required this.counterpartyName,
    required this.amount,
    required this.date,
    required this.accountId,
    required this.outstanding,
    required this.settled,
    required this.repayments,
    this.note,
    this.inviteSentToName,
    this.inviteAccepted,
  });

  final String id;
  final FinanceLoanDirection direction;
  final String counterpartyName;
  final double amount;
  final DateTime date;
  final String accountId;
  final double outstanding;
  final bool settled;
  final List<FinanceSettlementEntry> repayments;
  final String? note;

  /// 借出/借入互通——null 代表這筆借貸還沒邀請任何人確認；非 null 就是已經
  /// 邀請過的對象名字，[inviteAccepted] 表示對方是否已經接受。
  final String? inviteSentToName;
  final bool? inviteAccepted;

  factory FinanceLoan.fromJson(Map<String, dynamic> json) {
    final initial = json['initialTransaction'] as Map<String, dynamic>;
    return FinanceLoan(
      id: json['id'] as String,
      direction: FinanceLoanDirectionJson.fromJson(json['direction'] as String),
      counterpartyName: json['counterpartyName'] as String,
      amount: (initial['amount'] as num).toDouble(),
      date: DateTime.parse(initial['date'] as String),
      accountId: initial['accountId'] as String,
      note: initial['note'] as String?,
      outstanding: (json['outstanding'] as num).toDouble(),
      settled: json['settled'] as bool,
      repayments: (json['repayments'] as List<dynamic>? ?? const [])
          .map((e) => FinanceSettlementEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      inviteSentToName: (json['inviteSent'] as Map<String, dynamic>?)?['toUser']?['name'] as String?,
      inviteAccepted: (json['inviteSent'] as Map<String, dynamic>?)?['accepted'] as bool?,
    );
  }
}

/// 工作上先幫忙出錢，之後公司/專案還你 — same shape as [FinanceLoan] (see its
/// doc comment for why this is a separate model despite the similarity),
/// minus `direction` (always one-directional: advance out, reimbursed
/// in), plus an optional [projectId]/[projectName] link.
class FinanceAdvance {
  const FinanceAdvance({
    required this.id,
    required this.title,
    required this.amount,
    required this.date,
    required this.accountId,
    required this.outstanding,
    required this.settled,
    required this.repayments,
    this.note,
    this.projectId,
    this.projectName,
  });

  final String id;
  final String title;
  final double amount;
  final DateTime date;
  final String accountId;
  final double outstanding;
  final bool settled;
  final List<FinanceSettlementEntry> repayments;
  final String? note;
  final String? projectId;
  final String? projectName;

  factory FinanceAdvance.fromJson(Map<String, dynamic> json) {
    final initial = json['initialTransaction'] as Map<String, dynamic>;
    final project = json['project'] as Map<String, dynamic>?;
    return FinanceAdvance(
      id: json['id'] as String,
      title: json['title'] as String,
      amount: (initial['amount'] as num).toDouble(),
      date: DateTime.parse(initial['date'] as String),
      accountId: initial['accountId'] as String,
      note: initial['note'] as String?,
      outstanding: (json['outstanding'] as num).toDouble(),
      settled: json['settled'] as bool,
      repayments: (json['repayments'] as List<dynamic>? ?? const [])
          .map((e) => FinanceSettlementEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      projectId: json['projectId'] as String?,
      projectName: project?['name'] as String?,
    );
  }
}

/// Cursor-paginated (30/page) — mirrors `StockTransactionsPage`'s shape.
class FinanceLoansPage {
  const FinanceLoansPage({required this.items, required this.nextCursor});

  final List<FinanceLoan> items;
  final String? nextCursor;

  factory FinanceLoansPage.fromJson(Map<String, dynamic> json) => FinanceLoansPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => FinanceLoan.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

/// Cursor-paginated (30/page) — mirrors `StockTransactionsPage`'s shape.
class FinanceAdvancesPage {
  const FinanceAdvancesPage({required this.items, required this.nextCursor});

  final List<FinanceAdvance> items;
  final String? nextCursor;

  factory FinanceAdvancesPage.fromJson(Map<String, dynamic> json) => FinanceAdvancesPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => FinanceAdvance.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

/// 借出/借入互通——別人邀請你確認一筆借貸，接受後會在你自己的個人空間
/// 自動建一筆方向相反的對應紀錄。`GET /finance-loan-invites/received` 用。
class FinanceLoanInvite {
  const FinanceLoanInvite({
    required this.id,
    required this.accepted,
    required this.fromUserName,
    required this.direction,
    required this.counterpartyName,
    required this.amount,
    required this.date,
  });

  final String id;
  final bool accepted;
  final String fromUserName;

  /// 邀請人那邊登記的方向——接受後你這邊會是相反的方向（他借出去，你就
  /// 是借進來）。
  final FinanceLoanDirection direction;
  final String counterpartyName;
  final double amount;
  final DateTime date;

  factory FinanceLoanInvite.fromJson(Map<String, dynamic> json) {
    final fromLoan = json['fromLoan'] as Map<String, dynamic>;
    final initial = fromLoan['initialTransaction'] as Map<String, dynamic>;
    final fromUser = json['fromUser'] as Map<String, dynamic>;
    return FinanceLoanInvite(
      id: json['id'] as String,
      accepted: json['accepted'] as bool,
      fromUserName: fromUser['name'] as String,
      direction: FinanceLoanDirectionJson.fromJson(fromLoan['direction'] as String),
      counterpartyName: fromLoan['counterpartyName'] as String,
      amount: (initial['amount'] as num).toDouble(),
      date: DateTime.parse(initial['date'] as String),
    );
  }
}
