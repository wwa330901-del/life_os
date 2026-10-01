/// AI 記住的一件事（後端 UserMemory）。
class UserMemory {
  const UserMemory({required this.id, required this.content});

  final String id;
  final String content;

  factory UserMemory.fromJson(Map<String, dynamic> json) =>
      UserMemory(id: json['id'] as String, content: json['content'] as String);
}

/// 每年重複的重要日子（後端 ImportantDate）；[nextDate]/[daysLeft] 是下一次。
class ImportantDate {
  const ImportantDate({
    required this.id,
    required this.title,
    required this.month,
    required this.day,
    required this.isLunar,
    required this.nextDate,
    required this.daysLeft,
    this.year,
    this.years,
    this.note,
  });

  final String id;
  final String title;
  final int month;
  final int day;
  final int? year;
  final bool isLunar;
  final String? note;
  final String nextDate;
  final int daysLeft;

  /// 下一次滿幾歲／第幾週年（有填年份才有）。
  final int? years;

  String get dateLabel => '${isLunar ? '農曆' : ''}$month/$day';

  factory ImportantDate.fromJson(Map<String, dynamic> json) {
    final next = json['next'] as Map<String, dynamic>;
    return ImportantDate(
      id: json['id'] as String,
      title: json['title'] as String,
      month: json['month'] as int,
      day: json['day'] as int,
      year: json['year'] as int?,
      isLunar: json['isLunar'] as bool? ?? false,
      note: json['note'] as String?,
      nextDate: next['date'] as String,
      daysLeft: next['daysLeft'] as int,
      years: next['years'] as int?,
    );
  }
}
