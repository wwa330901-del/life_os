enum LifeGoalStatus { active, completed, abandoned }

extension LifeGoalStatusJson on LifeGoalStatus {
  String toJson() => switch (this) {
    LifeGoalStatus.active => 'ACTIVE',
    LifeGoalStatus.completed => 'COMPLETED',
    LifeGoalStatus.abandoned => 'ABANDONED',
  };

  String get label => switch (this) {
    LifeGoalStatus.active => '進行中',
    LifeGoalStatus.completed => '已完成',
    LifeGoalStatus.abandoned => '已放棄',
  };

  static LifeGoalStatus fromJson(String value) => switch (value) {
    'COMPLETED' => LifeGoalStatus.completed,
    'ABANDONED' => LifeGoalStatus.abandoned,
    _ => LifeGoalStatus.active,
  };
}

/// Where a goal's number comes from — see schema.prisma's
/// `LifeGoalTrackingType`. Everything except [manual] is computed by the
/// server on every read.
enum LifeGoalTrackingType { manual, accountBalance, netWorth, noteKeywordSum, stockValue, checkIn }

extension LifeGoalTrackingTypeJson on LifeGoalTrackingType {
  String toJson() => switch (this) {
    LifeGoalTrackingType.manual => 'MANUAL',
    LifeGoalTrackingType.accountBalance => 'ACCOUNT_BALANCE',
    LifeGoalTrackingType.netWorth => 'NET_WORTH',
    LifeGoalTrackingType.noteKeywordSum => 'NOTE_KEYWORD_SUM',
    LifeGoalTrackingType.stockValue => 'STOCK_VALUE',
    LifeGoalTrackingType.checkIn => 'CHECK_IN',
  };

  bool get isAuto =>
      this != LifeGoalTrackingType.manual && this != LifeGoalTrackingType.checkIn;

  static LifeGoalTrackingType fromJson(String? value) => switch (value) {
    'ACCOUNT_BALANCE' => LifeGoalTrackingType.accountBalance,
    'NET_WORTH' => LifeGoalTrackingType.netWorth,
    'NOTE_KEYWORD_SUM' => LifeGoalTrackingType.noteKeywordSum,
    'STOCK_VALUE' => LifeGoalTrackingType.stockValue,
    'CHECK_IN' => LifeGoalTrackingType.checkIn,
    _ => LifeGoalTrackingType.manual,
  };
}

/// Which window of check-ins counts toward the target (CHECK_IN only).
enum LifeGoalPeriod { total, weekly, monthly }

extension LifeGoalPeriodJson on LifeGoalPeriod {
  String toJson() => switch (this) {
    LifeGoalPeriod.total => 'TOTAL',
    LifeGoalPeriod.weekly => 'WEEKLY',
    LifeGoalPeriod.monthly => 'MONTHLY',
  };

  String get label => switch (this) {
    LifeGoalPeriod.total => '累計',
    LifeGoalPeriod.weekly => '本週',
    LifeGoalPeriod.monthly => '本月',
  };

  static LifeGoalPeriod fromJson(String? value) => switch (value) {
    'WEEKLY' => LifeGoalPeriod.weekly,
    'MONTHLY' => LifeGoalPeriod.monthly,
    _ => LifeGoalPeriod.total,
  };
}

/// `targetDate` is a Postgres `@db.Date` — the API sends it as UTC midnight
/// (`2026-12-31T00:00:00.000Z`), so it's kept as a date-only local
/// `DateTime` built from the UTC components; `.toLocal()` would be harmless
/// in Taiwan (UTC+8) but wrong anywhere west of UTC.
DateTime? parseLifeGoalDate(Object? value) {
  if (value == null) return null;
  final utc = DateTime.parse(value as String).toUtc();
  return DateTime(utc.year, utc.month, utc.day);
}

/// Shared progress math for [LifeGoal] and the home dashboard's
/// `HomeLifeGoal` — same formula as the API's `goalProgressFraction`:
/// measured from [startValue] (null = 0) so a goal that goes *down*
/// (體重 75→70) works too. Null when there's no usable target
/// (「學會放鬆」-style goals), otherwise clamped to 0..1.
double? lifeGoalProgress(double? targetValue, double? currentValue, [double? startValue]) {
  if (targetValue == null) return null;
  final start = startValue ?? 0;
  final current = currentValue ?? 0;
  if (targetValue == start) return current == targetValue ? 1 : 0;
  return ((current - start) / (targetValue - start)).clamp(0.0, 1.0);
}

/// 人生目標 — account-level, see schema.prisma's `LifeGoal` doc comment.
/// [targetValue]/[currentValue]/[unit] are each optional: a goal without a
/// target number only shows status + [targetDate], never a progress bar.
class LifeGoal {
  const LifeGoal({
    required this.id,
    required this.title,
    required this.notes,
    required this.category,
    required this.targetValue,
    required this.currentValue,
    required this.startValue,
    required this.unit,
    required this.targetDate,
    required this.status,
    required this.completedAt,
    required this.trackingType,
    required this.trackingAccountId,
    required this.trackingAccountName,
    required this.trackingKeyword,
    required this.checkInPeriod,
    required this.requireCheckInNote,
  });

  final String id;
  final String title;
  final String? notes;
  final String? category;
  final double? targetValue;
  final double? currentValue;
  final double? startValue;
  final String? unit;
  final DateTime? targetDate;
  final LifeGoalStatus status;
  final DateTime? completedAt;
  final LifeGoalTrackingType trackingType;
  final String? trackingAccountId;
  final String? trackingAccountName;
  final String? trackingKeyword;
  final LifeGoalPeriod checkInPeriod;
  final bool requireCheckInNote;

  double? get progress => lifeGoalProgress(targetValue, currentValue, startValue);

  factory LifeGoal.fromJson(Map<String, dynamic> json) => LifeGoal(
    id: json['id'] as String,
    title: json['title'] as String,
    notes: json['notes'] as String?,
    category: json['category'] as String?,
    targetValue: (json['targetValue'] as num?)?.toDouble(),
    currentValue: (json['currentValue'] as num?)?.toDouble(),
    startValue: (json['startValue'] as num?)?.toDouble(),
    unit: json['unit'] as String?,
    targetDate: parseLifeGoalDate(json['targetDate']),
    status: LifeGoalStatusJson.fromJson(json['status'] as String),
    completedAt: json['completedAt'] == null ? null : DateTime.parse(json['completedAt'] as String).toLocal(),
    trackingType: LifeGoalTrackingTypeJson.fromJson(json['trackingType'] as String?),
    trackingAccountId: json['trackingAccountId'] as String?,
    trackingAccountName: json['trackingAccountName'] as String?,
    trackingKeyword: json['trackingKeyword'] as String?,
    checkInPeriod: LifeGoalPeriodJson.fromJson(json['checkInPeriod'] as String?),
    requireCheckInNote: json['requireCheckInNote'] as bool? ?? false,
  );

  /// 「自動追蹤：帳戶「郵局」」-style one-liner for the card; null for plain manual goals.
  String? get trackingDescription => switch (trackingType) {
    LifeGoalTrackingType.manual => null,
    LifeGoalTrackingType.accountBalance => '自動追蹤：帳戶「${trackingAccountName ?? '已刪除的帳戶'}」餘額',
    LifeGoalTrackingType.netWorth => '自動追蹤：淨資產',
    LifeGoalTrackingType.noteKeywordSum => '自動追蹤：記帳備註含「${trackingKeyword ?? ''}」的存款',
    LifeGoalTrackingType.stockValue => '自動追蹤：持股市值',
    LifeGoalTrackingType.checkIn => '打卡・${checkInPeriod.label}${requireCheckInNote ? '・要寫心得' : ''}',
  };
}

/// `150000.0` → `150,000`, `3.5` → `3.5` — goal numbers are typed by hand,
/// so a trailing `.0` would just be noise; whole numbers get the same
/// thousands separator as 記帳's `formatAmount`.
String formatGoalNumber(double value) {
  if (value != value.roundToDouble()) return value.toString();
  final digits = value.abs().round().toString();
  final buffer = StringBuffer(value < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}

/// One 打卡 — a finished book, a workout. [title] is what it was (書名),
/// [note] the 心得／最喜歡的一句話.
class LifeGoalCheckIn {
  const LifeGoalCheckIn({required this.id, required this.date, required this.value, required this.title, required this.note});

  final String id;
  final DateTime date;
  final double value;
  final String? title;
  final String? note;

  factory LifeGoalCheckIn.fromJson(Map<String, dynamic> json) => LifeGoalCheckIn(
    id: json['id'] as String,
    date: parseLifeGoalDate(json['date'])!,
    value: (json['value'] as num).toDouble(),
    title: json['title'] as String?,
    note: json['note'] as String?,
  );
}

class LifeGoalAccountOption {
  const LifeGoalAccountOption({required this.id, required this.name});

  final String id;
  final String name;

  factory LifeGoalAccountOption.fromJson(Map<String, dynamic> json) =>
      LifeGoalAccountOption(id: json['id'] as String, name: json['name'] as String);
}

/// Everything the editor submits — create and update send the same full
/// shape (nulls clear a field on update), so there's one builder for both.
class LifeGoalInput {
  const LifeGoalInput({
    required this.title,
    required this.notes,
    required this.category,
    required this.targetValue,
    required this.currentValue,
    required this.startValue,
    required this.unit,
    required this.targetDate,
    required this.trackingType,
    required this.trackingAccountId,
    required this.trackingKeyword,
    required this.checkInPeriod,
    required this.requireCheckInNote,
  });

  final String title;
  final String? notes;
  final String? category;
  final double? targetValue;
  final double? currentValue;
  final double? startValue;
  final String? unit;
  final DateTime? targetDate;
  final LifeGoalTrackingType trackingType;
  final String? trackingAccountId;
  final String? trackingKeyword;
  final LifeGoalPeriod checkInPeriod;
  final bool requireCheckInNote;

  Map<String, dynamic> toJson() => {
    'title': title,
    'notes': notes,
    'category': category,
    'targetValue': targetValue,
    'currentValue': currentValue,
    'startValue': startValue,
    'unit': unit,
    'targetDate': targetDate == null
        ? null
        : '${targetDate!.year.toString().padLeft(4, '0')}-'
              '${targetDate!.month.toString().padLeft(2, '0')}-'
              '${targetDate!.day.toString().padLeft(2, '0')}',
    'trackingType': trackingType.toJson(),
    'trackingAccountId': trackingAccountId,
    'trackingKeyword': trackingKeyword,
    'checkInPeriod': checkInPeriod.toJson(),
    'requireCheckInNote': requireCheckInNote,
  };
}
