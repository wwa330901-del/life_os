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
  'projectSummary' => '專案總表',
  'todayTodos' => '本日代辦事項',
  'stockSummary' => '投資/持股總覽',
  'pendingApprovals' => '待我簽核',
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

class HomeWorkItemRef {
  const HomeWorkItemRef({required this.id, required this.name});

  final String id;
  final String name;

  factory HomeWorkItemRef.fromJson(Map<String, dynamic> json) =>
      HomeWorkItemRef(id: json['id'] as String, name: json['name'] as String);
}

class HomeProjectSummary {
  const HomeProjectSummary({
    required this.projectId,
    required this.projectName,
    required this.spaceName,
    required this.plannedToday,
    required this.actualToday,
  });

  final String projectId;
  final String projectName;
  final String spaceName;
  final List<HomeWorkItemRef> plannedToday;
  final List<HomeWorkItemRef> actualToday;

  factory HomeProjectSummary.fromJson(Map<String, dynamic> json) => HomeProjectSummary(
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    spaceName: json['spaceName'] as String,
    plannedToday: (json['plannedToday'] as List<dynamic>)
        .map((e) => HomeWorkItemRef.fromJson(e as Map<String, dynamic>))
        .toList(),
    actualToday: (json['actualToday'] as List<dynamic>)
        .map((e) => HomeWorkItemRef.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

class HomeTodoRef {
  const HomeTodoRef({required this.id, required this.title, required this.projectName});

  final String id;
  final String title;
  final String projectName;

  factory HomeTodoRef.fromJson(Map<String, dynamic> json) => HomeTodoRef(
    id: json['id'] as String,
    title: json['title'] as String,
    projectName: json['projectName'] as String,
  );
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

class HomePendingApproval {
  const HomePendingApproval({
    required this.stepId,
    required this.sequence,
    required this.totalSteps,
    required this.documentId,
    required this.documentName,
    required this.projectId,
    required this.submittedByName,
  });

  final String stepId;
  final int sequence;
  final int totalSteps;
  final String documentId;
  final String documentName;
  final String projectId;
  final String submittedByName;

  factory HomePendingApproval.fromJson(Map<String, dynamic> json) => HomePendingApproval(
    stepId: json['stepId'] as String,
    sequence: json['sequence'] as int,
    totalSteps: json['totalSteps'] as int,
    documentId: json['documentId'] as String,
    documentName: json['documentName'] as String,
    projectId: json['projectId'] as String,
    submittedByName: json['submittedByName'] as String,
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
    required this.projectSummary,
    required this.todosToday,
    required this.stockSummary,
    required this.pendingApprovals,
    required this.ongoingTodos,
    required this.recentKnowledgeItems,
  });

  final HomePersonalFinance? personalFinance;
  final List<HomeProjectSummary> projectSummary;
  final HomeTodosToday todosToday;
  final HomeStockSummary? stockSummary;
  final List<HomePendingApproval> pendingApprovals;
  final List<HomeTodoRef> ongoingTodos;
  final List<HomeKnowledgeItemPreview> recentKnowledgeItems;

  factory HomeDashboard.fromJson(Map<String, dynamic> json) => HomeDashboard(
    personalFinance: json['personalFinance'] == null
        ? null
        : HomePersonalFinance.fromJson(json['personalFinance'] as Map<String, dynamic>),
    projectSummary: (json['projectSummary'] as List<dynamic>)
        .map((e) => HomeProjectSummary.fromJson(e as Map<String, dynamic>))
        .toList(),
    todosToday: HomeTodosToday.fromJson(json['todosToday'] as Map<String, dynamic>),
    stockSummary: json['stockSummary'] == null
        ? null
        : HomeStockSummary.fromJson(json['stockSummary'] as Map<String, dynamic>),
    pendingApprovals: (json['pendingApprovals'] as List<dynamic>)
        .map((e) => HomePendingApproval.fromJson(e as Map<String, dynamic>))
        .toList(),
    ongoingTodos: (json['ongoingTodos'] as List<dynamic>)
        .map((e) => HomeTodoRef.fromJson(e as Map<String, dynamic>))
        .toList(),
    recentKnowledgeItems: (json['recentKnowledgeItems'] as List<dynamic>)
        .map((e) => HomeKnowledgeItemPreview.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
