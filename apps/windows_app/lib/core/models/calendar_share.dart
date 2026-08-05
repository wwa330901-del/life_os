enum CalendarShareDetailLevel { full, busyOnly }

extension CalendarShareDetailLevelJson on CalendarShareDetailLevel {
  static CalendarShareDetailLevel fromJson(String value) =>
      value == 'BUSY_ONLY' ? CalendarShareDetailLevel.busyOnly : CalendarShareDetailLevel.full;

  String toJson() => this == CalendarShareDetailLevel.busyOnly ? 'BUSY_ONLY' : 'FULL';

  String get label => this == CalendarShareDetailLevel.busyOnly ? '只顯示忙碌/空閒' : '完整內容';
}

class CalendarShareUser {
  const CalendarShareUser({required this.id, required this.name, this.email});

  final String id;
  final String name;
  final String? email;

  factory CalendarShareUser.fromJson(Map<String, dynamic> json) => CalendarShareUser(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String?,
  );
}

/// 共用行事曆的一筆邀請/分享關係——`owner` 是分享行事曆的人，`viewer` 是被邀
/// 請看的人。`GET /calendar-shares/given` 回傳的每一筆 [owner] 就是呼叫
/// 者自己（沒有回傳，用不到），[viewer] 才是對方；`received` 則相反。
class CalendarShare {
  const CalendarShare({
    required this.id,
    required this.accepted,
    required this.detailLevel,
    required this.viewerColor,
    this.owner,
    this.viewer,
  });

  final String id;
  final bool accepted;
  final CalendarShareDetailLevel detailLevel;
  final String viewerColor;
  final CalendarShareUser? owner;
  final CalendarShareUser? viewer;

  factory CalendarShare.fromJson(Map<String, dynamic> json) => CalendarShare(
    id: json['id'] as String,
    accepted: json['accepted'] as bool,
    detailLevel: CalendarShareDetailLevelJson.fromJson(json['detailLevel'] as String),
    viewerColor: json['viewerColor'] as String,
    owner: json['owner'] == null ? null : CalendarShareUser.fromJson(json['owner'] as Map<String, dynamic>),
    viewer: json['viewer'] == null ? null : CalendarShareUser.fromJson(json['viewer'] as Map<String, dynamic>),
  );
}

/// One entry of another owner's calendar as seen on the viewer's combined
/// 共用行事曆 view — `title`/`location`/`notes` are already stripped down to
/// "忙碌" server-side when that share's `detailLevel` is `busyOnly`, the
/// App never has to re-check the level itself.
class SharedCalendarEntry {
  const SharedCalendarEntry({
    required this.id,
    required this.startAt,
    required this.endAt,
    required this.allDay,
    required this.title,
    required this.location,
    required this.notes,
    required this.ownerUserId,
    required this.ownerName,
    required this.color,
  });

  final String id;
  final DateTime startAt;
  final DateTime? endAt;
  final bool allDay;
  final String title;
  final String? location;
  final String? notes;
  final String ownerUserId;
  final String ownerName;
  final String color;

  factory SharedCalendarEntry.fromJson(Map<String, dynamic> json) => SharedCalendarEntry(
    id: json['id'] as String,
    startAt: DateTime.parse(json['startAt'] as String).toLocal(),
    endAt: json['endAt'] == null ? null : DateTime.parse(json['endAt'] as String).toLocal(),
    allDay: json['allDay'] as bool,
    title: json['title'] as String,
    location: json['location'] as String?,
    notes: json['notes'] as String?,
    ownerUserId: json['ownerUserId'] as String,
    ownerName: json['ownerName'] as String,
    color: json['color'] as String,
  );
}
