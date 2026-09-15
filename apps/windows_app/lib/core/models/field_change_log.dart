/// 異動留痕（2026-09，見後端 schema.prisma 的 FieldChangeLog）——目前只有
/// 報價單項目跟採發比價表決標金額兩種來源，見 `FieldChangeEntityType`。
enum FieldChangeEntityType { quotationLineItem, procurementComparison }

String fieldChangeEntityTypeToJson(FieldChangeEntityType type) => switch (type) {
  FieldChangeEntityType.quotationLineItem => 'QUOTATION_LINE_ITEM',
  FieldChangeEntityType.procurementComparison => 'PROCUREMENT_COMPARISON',
};

class FieldChangeLogEntry {
  const FieldChangeLogEntry({
    required this.fieldLabel,
    required this.oldValue,
    required this.newValue,
    required this.changedByName,
    required this.changedAt,
  });

  final String fieldLabel;
  final String? oldValue;
  final String? newValue;
  final String changedByName;
  final DateTime changedAt;

  factory FieldChangeLogEntry.fromJson(Map<String, dynamic> json) => FieldChangeLogEntry(
    fieldLabel: json['fieldLabel'] as String,
    oldValue: json['oldValue'] as String?,
    newValue: json['newValue'] as String?,
    changedByName: (json['changedByUser'] as Map<String, dynamic>)['name'] as String,
    changedAt: DateTime.parse(json['changedAt'] as String),
  );
}
