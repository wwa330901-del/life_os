/// 平帳（2026-11-21）：填帳戶現在實際有多少，差額記一筆「忘記記帳」／「多出來的錢」。
library;

double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

class ReconcilePreview {
  const ReconcilePreview({required this.bookBalance, required this.actualBalance, required this.difference, required this.categoryName});

  final double bookBalance;
  final double actualBalance;

  /// 0＝不用平帳；負的＝忘記記的支出；正的＝多出來的錢。
  final double difference;
  final String? categoryName;

  factory ReconcilePreview.fromJson(Map<String, dynamic> json) {
    final plan = json['plan'] as Map<String, dynamic>?;
    return ReconcilePreview(
      bookBalance: _num(json['bookBalance']),
      actualBalance: _num(json['actualBalance']),
      difference: plan == null ? 0 : _num(plan['difference']),
      categoryName: plan?['categoryName'] as String?,
    );
  }
}

class Reconciliation {
  const Reconciliation({
    required this.id,
    required this.date,
    required this.accountName,
    required this.bookBalance,
    required this.actualBalance,
    required this.difference,
  });

  final String id;
  final DateTime date;
  final String accountName;
  final double bookBalance;
  final double actualBalance;
  final double difference;

  factory Reconciliation.fromJson(Map<String, dynamic> json) => Reconciliation(
    id: json['id'] as String,
    date: DateTime.parse(json['date'] as String),
    accountName: json['accountName'] as String,
    bookBalance: _num(json['bookBalance']),
    actualBalance: _num(json['actualBalance']),
    difference: _num(json['difference']),
  );
}

class ReconciliationHistory {
  const ReconciliationHistory({required this.items, required this.thisYear});

  final List<Reconciliation> items;

  /// 今年每個帳戶差額合計（帳戶名 → 差額）。
  final Map<String, double> thisYear;

  factory ReconciliationHistory.fromJson(Map<String, dynamic> json) => ReconciliationHistory(
    items: (json['items'] as List<dynamic>).map((e) => Reconciliation.fromJson(e as Map<String, dynamic>)).toList(),
    thisYear: {
      for (final e in (json['thisYear'] as List<dynamic>? ?? const []))
        (e as Map<String, dynamic>)['accountName'] as String: _num(e['difference']),
    },
  );
}
