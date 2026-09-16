enum ContactRecordType {
  contactSheet,
  meetingMinutes;

  static ContactRecordType fromJson(String value) => switch (value) {
    'CONTACT_SHEET' => ContactRecordType.contactSheet,
    'MEETING_MINUTES' => ContactRecordType.meetingMinutes,
    _ => throw ArgumentError('Unknown ContactRecordType: $value'),
  };

  String toJson() => switch (this) {
    ContactRecordType.contactSheet => 'CONTACT_SHEET',
    ContactRecordType.meetingMinutes => 'MEETING_MINUTES',
  };

  String get label => switch (this) {
    ContactRecordType.contactSheet => '聯絡單',
    ContactRecordType.meetingMinutes => '會議記錄',
  };
}

/// 聯絡單與會議記錄（2026-09，顧問文件「工程執行紀錄系統」第三項）——純
/// CRUD 隨手記錄，不是週期性繳交。
class ContactRecord {
  const ContactRecord({
    required this.id,
    required this.type,
    required this.recordDate,
    required this.title,
    required this.content,
    required this.attendees,
    required this.createdByName,
    required this.createdAt,
  });

  final String id;
  final ContactRecordType type;
  final DateTime recordDate;
  final String title;
  final String content;
  final String? attendees;
  final String createdByName;
  final DateTime createdAt;

  factory ContactRecord.fromJson(Map<String, dynamic> json) => ContactRecord(
    id: json['id'] as String,
    type: ContactRecordType.fromJson(json['type'] as String),
    recordDate: DateTime.parse(json['recordDate'] as String),
    title: json['title'] as String,
    content: json['content'] as String,
    attendees: json['attendees'] as String?,
    createdByName: (json['createdBy'] as Map<String, dynamic>)['name'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}
