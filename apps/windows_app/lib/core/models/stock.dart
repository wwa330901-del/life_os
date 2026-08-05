import 'finance.dart';

enum StockTransactionType { buy, sell }

extension StockTransactionTypeJson on StockTransactionType {
  static StockTransactionType fromJson(String value) =>
      value == 'SELL' ? StockTransactionType.sell : StockTransactionType.buy;

  String toJson() => this == StockTransactionType.sell ? 'SELL' : 'BUY';

  String get label => this == StockTransactionType.sell ? '賣出' : '買入';
}

/// A manually-entered (or LINE 定期定額 fill-in) stock buy/sell. [shares] is
/// always server-derived (totalCost / pricePerShare) — never typed by the
/// user. [tradeDate] is just the registration date; the real money movement
/// happens at [settlementDate] (T+2), when [settled] flips to true.
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
/// [FinanceRecurringTransaction]. Never auto-records an amount (a DCA fill
/// price is different every round) — the due day just sends a LINE
/// reminder asking for 成交價／投入成本.
class StockRecurringInvestment {
  const StockRecurringInvestment({
    required this.id,
    required this.stockCode,
    required this.dayOfMonth,
    required this.holidayAdjustment,
    required this.accountId,
    required this.active,
    required this.awaitingReply,
  });

  final String id;
  final String stockCode;
  final int dayOfMonth;
  final FinanceRecurringHolidayAdjustment holidayAdjustment;
  final String accountId;
  final bool active;
  final bool awaitingReply;

  factory StockRecurringInvestment.fromJson(Map<String, dynamic> json) => StockRecurringInvestment(
    id: json['id'] as String,
    stockCode: json['stockCode'] as String,
    dayOfMonth: json['dayOfMonth'] as int,
    holidayAdjustment: FinanceRecurringHolidayAdjustmentJson.fromJson(json['holidayAdjustment'] as String),
    accountId: json['accountId'] as String,
    active: json['active'] as bool,
    awaitingReply: json['awaitingReply'] as bool,
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
