import 'finance.dart';
import 'knowledge.dart';

/// Read-only account balance for the home dashboard — unlike
/// `FinanceAccount`, there's no `initialBalance`/`sortOrder` to carry
/// around since this is a display-only summary, not something the
/// dashboard edits.
class HomeAccountBalance {
  const HomeAccountBalance({required this.id, required this.name, required this.type, required this.balance});

  final String id;
  final String name;
  final FinanceAccountType type;
  final double balance;

  factory HomeAccountBalance.fromJson(Map<String, dynamic> json) => HomeAccountBalance(
    id: json['id'] as String,
    name: json['name'] as String,
    type: FinanceAccountTypeJson.fromJson(json['type'] as String),
    balance: (json['balance'] as num).toDouble(),
  );
}

class HomeWidgetConfig {
  const HomeWidgetConfig({required this.type, required this.visible});

  final String type;
  final bool visible;

  factory HomeWidgetConfig.fromJson(Map<String, dynamic> json) =>
      HomeWidgetConfig(type: json['type'] as String, visible: json['visible'] as bool);

  Map<String, dynamic> toJson() => {'type': type, 'visible': visible};

  HomeWidgetConfig copyWith({bool? visible}) =>
      HomeWidgetConfig(type: type, visible: visible ?? this.visible);
}

/// Display label for a widget type — kept next to the model since every
/// screen that lists widgets (dashboard itself, the customize dialog)
/// needs the same mapping.
String homeWidgetLabel(String type) => switch (type) {
  'personalFinance' => '個人財務狀況',
  'todayFinance' => '本日支出及收入',
  'todayTodos' => '本日代辦事項',
  'stockSummary' => '投資/持股總覽',
  'ongoingTodos' => '持續性任務',
  'recentKnowledgeItems' => '知識庫最新入庫',
  _ => type,
};

class HomePersonalFinance {
  const HomePersonalFinance({required this.accounts, required this.todayIncome, required this.todayExpense});

  final List<HomeAccountBalance> accounts;
  final double todayIncome;
  final double todayExpense;

  factory HomePersonalFinance.fromJson(Map<String, dynamic> json) => HomePersonalFinance(
    accounts: (json['accounts'] as List<dynamic>)
        .map((e) => HomeAccountBalance.fromJson(e as Map<String, dynamic>))
        .toList(),
    todayIncome: (json['todayIncome'] as num).toDouble(),
    todayExpense: (json['todayExpense'] as num).toDouble(),
  );
}

class HomeTodoRef {
  const HomeTodoRef({required this.id, required this.title});

  final String id;
  final String title;

  factory HomeTodoRef.fromJson(Map<String, dynamic> json) =>
      HomeTodoRef(id: json['id'] as String, title: json['title'] as String);
}

class HomeTodosToday {
  const HomeTodosToday({required this.completedToday, required this.dueTodayIncomplete});

  final List<HomeTodoRef> completedToday;
  final List<HomeTodoRef> dueTodayIncomplete;

  factory HomeTodosToday.fromJson(Map<String, dynamic> json) => HomeTodosToday(
    completedToday: (json['completedToday'] as List<dynamic>)
        .map((e) => HomeTodoRef.fromJson(e as Map<String, dynamic>))
        .toList(),
    dueTodayIncomplete: (json['dueTodayIncomplete'] as List<dynamic>)
        .map((e) => HomeTodoRef.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class HomeStockHolding {
  const HomeStockHolding({
    required this.stockCode,
    required this.stockName,
    required this.shares,
    required this.marketValue,
    required this.gainLoss,
  });

  final String stockCode;
  final String? stockName;
  final double shares;
  final double? marketValue;
  final double? gainLoss;

  factory HomeStockHolding.fromJson(Map<String, dynamic> json) => HomeStockHolding(
    stockCode: json['stockCode'] as String,
    stockName: json['stockName'] as String?,
    shares: (json['shares'] as num).toDouble(),
    marketValue: (json['marketValue'] as num?)?.toDouble(),
    gainLoss: (json['gainLoss'] as num?)?.toDouble(),
  );
}

class HomeStockSummary {
  const HomeStockSummary({required this.totalMarketValue, required this.totalGainLoss, required this.holdings});

  final double? totalMarketValue;
  final double? totalGainLoss;
  final List<HomeStockHolding> holdings;

  factory HomeStockSummary.fromJson(Map<String, dynamic> json) => HomeStockSummary(
    totalMarketValue: (json['totalMarketValue'] as num?)?.toDouble(),
    totalGainLoss: (json['totalGainLoss'] as num?)?.toDouble(),
    holdings: (json['holdings'] as List<dynamic>)
        .map((e) => HomeStockHolding.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class HomeKnowledgeItemPreview {
  const HomeKnowledgeItemPreview({
    required this.id,
    required this.title,
    required this.categoryName,
    required this.status,
  });

  final String id;
  final String title;
  final String? categoryName;
  final KnowledgeItemStatus status;

  factory HomeKnowledgeItemPreview.fromJson(Map<String, dynamic> json) => HomeKnowledgeItemPreview(
    id: json['id'] as String,
    title: json['title'] as String,
    categoryName: json['categoryName'] as String?,
    status: KnowledgeItemStatusJson.fromJson(json['status'] as String),
  );
}

class HomeDashboard {
  const HomeDashboard({
    required this.personalFinance,
    required this.todosToday,
    required this.stockSummary,
    required this.ongoingTodos,
    required this.recentKnowledgeItems,
  });

  final HomePersonalFinance? personalFinance;
  final HomeTodosToday todosToday;
  final HomeStockSummary? stockSummary;
  final List<HomeTodoRef> ongoingTodos;
  final List<HomeKnowledgeItemPreview> recentKnowledgeItems;

  factory HomeDashboard.fromJson(Map<String, dynamic> json) => HomeDashboard(
    personalFinance: json['personalFinance'] == null
        ? null
        : HomePersonalFinance.fromJson(json['personalFinance'] as Map<String, dynamic>),
    todosToday: HomeTodosToday.fromJson(json['todosToday'] as Map<String, dynamic>),
    stockSummary: json['stockSummary'] == null
        ? null
        : HomeStockSummary.fromJson(json['stockSummary'] as Map<String, dynamic>),
    ongoingTodos: (json['ongoingTodos'] as List<dynamic>)
        .map((e) => HomeTodoRef.fromJson(e as Map<String, dynamic>))
        .toList(),
    recentKnowledgeItems: (json['recentKnowledgeItems'] as List<dynamic>)
        .map((e) => HomeKnowledgeItemPreview.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
