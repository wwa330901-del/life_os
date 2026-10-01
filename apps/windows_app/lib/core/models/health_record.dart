/// 健康 — see schema.prisma's `HealthRecord`.
enum HealthType {
  sleep('SLEEP', '睡眠', '😴'),
  exercise('EXERCISE', '運動', '🏃'),
  weight('WEIGHT', '體重', '⚖️'),
  steps('STEPS', '步數', '👟');

  const HealthType(this.api, this.label, this.emoji);

  final String api;
  final String label;
  final String emoji;

  static HealthType fromApi(String value) => values.firstWhere((t) => t.api == value);
}

class HealthRecord {
  const HealthRecord({
    required this.id,
    required this.type,
    required this.date,
    this.startAt,
    this.endAt,
    this.minutes,
    this.value,
    this.activity,
    this.note,
    required this.source,
  });

  final String id;
  final HealthType type;

  /// Date-only (Taipei calendar day; 睡眠＝起床那天).
  final DateTime date;
  final DateTime? startAt;
  final DateTime? endAt;
  final int? minutes;
  final double? value;
  final String? activity;
  final String? note;

  /// MANUAL / AI / SHORTCUT（iPhone 自動）
  final String source;

  factory HealthRecord.fromJson(Map<String, dynamic> json) {
    final date = DateTime.parse(json['date'] as String);
    DateTime? local(Object? v) => v == null ? null : DateTime.parse(v as String).toLocal();
    return HealthRecord(
      id: json['id'] as String,
      type: HealthType.fromApi(json['type'] as String),
      date: DateTime(date.year, date.month, date.day),
      startAt: local(json['startAt']),
      endAt: local(json['endAt']),
      minutes: json['minutes'] as int?,
      value: (json['value'] as num?)?.toDouble(),
      activity: json['activity'] as String?,
      note: json['note'] as String?,
      source: json['source'] as String? ?? 'MANUAL',
    );
  }

  String get summary => switch (type) {
    HealthType.sleep => minutes == null ? '睡覺中（還沒起床）' : formatHealthMinutes(minutes!),
    HealthType.exercise => '${activity ?? '運動'}${minutes != null ? ' $minutes 分鐘' : ''}',
    HealthType.weight => '${value?.toStringAsFixed(1)} 公斤',
    HealthType.steps => '${formatThousands(value?.round() ?? 0)} 步',
  };
}

/// Last N days — `GET /health/summary`.
class HealthSummary {
  const HealthSummary({
    required this.sleepNights,
    required this.sleepAverageMinutes,
    required this.shortNights,
    required this.exerciseSessions,
    required this.exerciseMinutes,
    required this.weightLast,
    required this.weightChange,
    required this.stepsAverage,
  });

  final int sleepNights;
  final int? sleepAverageMinutes;
  final int shortNights;
  final int exerciseSessions;
  final int exerciseMinutes;
  final double? weightLast;
  final double? weightChange;
  final int? stepsAverage;

  factory HealthSummary.fromJson(Map<String, dynamic> json) {
    final sleep = json['sleep'] as Map<String, dynamic>;
    final exercise = json['exercise'] as Map<String, dynamic>;
    final weight = json['weight'] as Map<String, dynamic>?;
    final steps = json['steps'] as Map<String, dynamic>;
    return HealthSummary(
      sleepNights: sleep['nights'] as int,
      sleepAverageMinutes: sleep['averageMinutes'] as int?,
      shortNights: sleep['shortNights'] as int,
      exerciseSessions: exercise['sessions'] as int,
      exerciseMinutes: exercise['totalMinutes'] as int,
      weightLast: (weight?['last'] as num?)?.toDouble(),
      weightChange: (weight?['change'] as num?)?.toDouble(),
      stepsAverage: steps['average'] as int?,
    );
  }
}

String formatHealthMinutes(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '$m 分';
  return m == 0 ? '$h 小時' : '$h 小時 $m 分';
}

String formatThousands(int n) =>
    n.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

String healthDateKey(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
