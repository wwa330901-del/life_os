import 'finance.dart';

enum StockTransactionType { buy, sell }

extension StockTransactionTypeJson on StockTransactionType {
  static StockTransactionType fromJson(String value) =>
      value == 'SELL' ? StockTransactionType.sell : StockTransactionType.buy;

  String toJson() => this == StockTransactionType.sell ? 'SELL' : 'BUY';

  String get label => this == StockTransactionType.sell ? '賣出' : '買入';
}

/// A manually-entered stock buy/sell, OR a 定期定額 fill-in. [shares]/
/// [pricePerShare] are server-derived for both entry points now (2026-08-12:
/// manual entries type 股數, DCA entries type 成交價 with the plan's own
/// monthlyAmount supplying the rest) — never both typed together.
/// [tradeDate] is just the registration date; for a manual trade the real
/// money movement happens at [settlementDate] (T+2); a 定期定額 fill-in
/// settles immediately instead (T, no waiting). [pending] marks a 定期定額
/// row auto-created on its trigger date that's still waiting for a 成交價 —
/// pricePerShare/shares/totalCost are placeholder (0/0/monthlyAmount) until
/// then, see [recurringInvestmentId].
class StockTransaction {
  const StockTransaction({
    required this.id,
    required this.stockCode,
    required this.type,
    required this.pricePerShare,
    required this.totalCost,
    required this.shares,
    required this.tradeDate,
    required this.settlementDate,
    required this.settled,
    required this.accountId,
    required this.note,
    required this.pending,
    required this.recurringInvestmentId,
  });

  final String id;
  final String stockCode;
  final StockTransactionType type;
  final double pricePerShare;
  final double totalCost;
  final double shares;
  final DateTime tradeDate;
  final DateTime settlementDate;
  final bool settled;
  final String accountId;
  final String? note;
  final bool pending;
  final String? recurringInvestmentId;

  factory StockTransaction.fromJson(Map<String, dynamic> json) => StockTransaction(
    id: json['id'] as String,
    stockCode: json['stockCode'] as String,
    type: StockTransactionTypeJson.fromJson(json['type'] as String),
    pricePerShare: (json['pricePerShare'] as num).toDouble(),
    totalCost: (json['totalCost'] as num).toDouble(),
    shares: (json['shares'] as num).toDouble(),
    tradeDate: DateTime.parse(json['tradeDate'] as String),
    settlementDate: DateTime.parse(json['settlementDate'] as String),
    settled: json['settled'] as bool,
    accountId: json['accountId'] as String,
    note: json['note'] as String?,
    pending: json['pending'] as bool? ?? false,
    recurringInvestmentId: json['recurringInvestmentId'] as String?,
  );
}

/// One page of a cursor-paginated `GET /spaces/:spaceId/stocks/transactions`
/// fetch — `nextCursor` is null once there's nothing more to load.
class StockTransactionsPage {
  const StockTransactionsPage({required this.items, required this.nextCursor});

  final List<StockTransaction> items;
  final String? nextCursor;

  factory StockTransactionsPage.fromJson(Map<String, dynamic> json) => StockTransactionsPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => StockTransaction.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

/// A 定期定額（DCA）計畫 — same 每月第幾天＋遇假日調整 shape as
/// [FinanceRecurringTransaction]. 到期時系統自動用 [monthlyAmount] 先建一筆
/// 待填成交價的交易（見 StockTransaction.pending），使用者只需要回覆/填入
/// 成交價，系統自動算出買得起的整股數並立即扣款（2026-08-12 起，不用等
/// T+2 交割排程）。
class StockRecurringInvestment {
  const StockRecurringInvestment({
    required this.id,
    required this.stockCode,
    required this.dayOfMonth,
    required this.holidayAdjustment,
    required this.accountId,
    required this.active,
    required this.awaitingReply,
    required this.monthlyAmount,
  });

  final String id;
  final String stockCode;
  final int dayOfMonth;
  final FinanceRecurringHolidayAdjustment holidayAdjustment;
  final String accountId;
  final bool active;
  final bool awaitingReply;

  /// Null 只會出現在這個欄位剛上線、使用者還沒重新編輯儲存過的舊計畫——
  /// 到期不會發提醒，直到使用者補上這個值。
  final double? monthlyAmount;

  factory StockRecurringInvestment.fromJson(Map<String, dynamic> json) => StockRecurringInvestment(
    id: json['id'] as String,
    stockCode: json['stockCode'] as String,
    dayOfMonth: json['dayOfMonth'] as int,
    holidayAdjustment: FinanceRecurringHolidayAdjustmentJson.fromJson(json['holidayAdjustment'] as String),
    accountId: json['accountId'] as String,
    active: json['active'] as bool,
    awaitingReply: json['awaitingReply'] as bool,
    monthlyAmount: json['monthlyAmount'] == null ? null : (json['monthlyAmount'] as num).toDouble(),
  );
}

/// One row of the 持股總覽 — derived server-side from every StockTransaction
/// against a stock code (average-cost-basis method) plus the latest cached
/// price. [currentPrice]/[marketValue]/[gainLoss] are null when no price has
/// been fetched for this code yet.
class StockHolding {
  const StockHolding({
    required this.stockCode,
    required this.stockName,
    required this.shares,
    required this.costBasis,
    required this.averageCost,
    required this.currentPrice,
    required this.marketValue,
    required this.gainLoss,
  });

  final String stockCode;
  final String? stockName;
  final double shares;
  final double costBasis;
  final double averageCost;
  final double? currentPrice;
  final double? marketValue;
  final double? gainLoss;

  factory StockHolding.fromJson(Map<String, dynamic> json) => StockHolding(
    stockCode: json['stockCode'] as String,
    stockName: json['stockName'] as String?,
    shares: (json['shares'] as num).toDouble(),
    costBasis: (json['costBasis'] as num).toDouble(),
    averageCost: (json['averageCost'] as num).toDouble(),
    currentPrice: (json['currentPrice'] as num?)?.toDouble(),
    marketValue: (json['marketValue'] as num?)?.toDouble(),
    gainLoss: (json['gainLoss'] as num?)?.toDouble(),
  );
}
