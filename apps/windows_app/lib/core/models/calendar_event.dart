/// 行事曆循環事件 (2026-08-05) — NONE means a plain one-off event.
enum CalendarRecurrenceFrequency { none, daily, weekly, monthly }

extension CalendarRecurrenceFrequencyJson on CalendarRecurrenceFrequency {
  static CalendarRecurrenceFrequency fromJson(String value) => switch (value) {
    'DAILY' => CalendarRecurrenceFrequency.daily,
    'WEEKLY' => CalendarRecurrenceFrequency.weekly,
    'MONTHLY' => CalendarRecurrenceFrequency.monthly,
    _ => CalendarRecurrenceFrequency.none,
  };

  String toJson() => switch (this) {
    CalendarRecurrenceFrequency.none => 'NONE',
    CalendarRecurrenceFrequency.daily => 'DAILY',
    CalendarRecurrenceFrequency.weekly => 'WEEKLY',
    CalendarRecurrenceFrequency.monthly => 'MONTHLY',
  };

  String get label => switch (this) {
    CalendarRecurrenceFrequency.none => '不循環',
    CalendarRecurrenceFrequency.daily => '每天',
    CalendarRecurrenceFrequency.weekly => '每週',
    CalendarRecurrenceFrequency.monthly => '每月',
  };
}

/// Google Calendar 風格的編輯範圍——只在編輯/刪除一個循環事件的某次發生
/// （[CalendarEvent.seriesId] 非 null）時才需要問使用者。
enum CalendarOccurrenceScope { thisOne, following, all }

extension CalendarOccurrenceScopeJson on CalendarOccurrenceScope {
  String toJson() => switch (this) {
    CalendarOccurrenceScope.thisOne => 'THIS',
    CalendarOccurrenceScope.following => 'FOLLOWING',
    CalendarOccurrenceScope.all => 'ALL',
  };

  String get label => switch (this) {
    CalendarOccurrenceScope.thisOne => '只改這次',
    CalendarOccurrenceScope.following => '這次以後',
    CalendarOccurrenceScope.all => '全部',
  };
}

/// One event on a 行事曆空間's calendar — independent of ProjectTodo (see
/// CalendarScreen for how the two are shown together, read-only for todos).
/// [seriesId]/[occurrenceDate] are non-null exactly when this is one
/// occurrence of a recurring series (never its own row — see the backend's
/// `CalendarEventsService.list` doc comment) rather than a plain one-off
/// event; editing/deleting one needs a 只改這次／這次以後／全部 scope
/// choice first (see `CalendarOccurrenceScope`), a plain event doesn't.
class CalendarEvent {
  const CalendarEvent({
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.allDay,
    required this.location,
    required this.notes,
    required this.googleEventId,
    required this.recurrenceFrequency,
    required this.recurrenceUntil,
    required this.seriesId,
    required this.occurrenceDate,
  });

  final String id;
  final String title;
  final DateTime startAt;
  final DateTime? endAt;
  final bool allDay;
  final String? location;
  final String? notes;
  final String? googleEventId;
  final CalendarRecurrenceFrequency recurrenceFrequency;
  final DateTime? recurrenceUntil;

  /// The recurring series' own CalendarEvent id — null for a plain event.
  final String? seriesId;

  /// "YYYY-MM-DD" (Taipei calendar date) — null for a plain event.
  final String? occurrenceDate;

  bool get isRecurring => seriesId != null;

  factory CalendarEvent.fromJson(Map<String, dynamic> json) => CalendarEvent(
    id: json['id'] as String,
    title: json['title'] as String,
    startAt: DateTime.parse(json['startAt'] as String).toLocal(),
    endAt: json['endAt'] == null ? null : DateTime.parse(json['endAt'] as String).toLocal(),
    allDay: json['allDay'] as bool,
    location: json['location'] as String?,
    notes: json['notes'] as String?,
    googleEventId: json['googleEventId'] as String?,
    recurrenceFrequency: CalendarRecurrenceFrequencyJson.fromJson(
      json['recurrenceFrequency'] as String? ?? 'NONE',
    ),
    recurrenceUntil: json['recurrenceUntil'] == null
        ? null
        : DateTime.parse(json['recurrenceUntil'] as String).toLocal(),
    seriesId: json['seriesId'] as String?,
    occurrenceDate: json['occurrenceDate'] as String?,
  );
}

class GoogleCalendarConnectionStatus {
  const GoogleCalendarConnectionStatus({required this.connected, required this.lastSyncedAt});

  final bool connected;
  final DateTime? lastSyncedAt;

  factory GoogleCalendarConnectionStatus.fromJson(Map<String, dynamic> json) =>
      GoogleCalendarConnectionStatus(
        connected: json['connected'] as bool,
        lastSyncedAt: json['lastSyncedAt'] == null
            ? null
            : DateTime.parse(json['lastSyncedAt'] as String).toLocal(),
      );
}

class AppleCalendarSummary {
  const AppleCalendarSummary({required this.url, required this.displayName});

  final String url;
  final String displayName;

  factory AppleCalendarSummary.fromJson(Map<String, dynamic> json) =>
      AppleCalendarSummary(url: json['url'] as String, displayName: json['displayName'] as String);
}

class AppleCalendarConnectionStatus {
  const AppleCalendarConnectionStatus({
    required this.connected,
    required this.appleId,
    required this.selectedCalendarUrls,
    required this.lastSyncedAt,
  });

  final bool connected;
  final String? appleId;
  final List<String> selectedCalendarUrls;
  final DateTime? lastSyncedAt;

  factory AppleCalendarConnectionStatus.fromJson(Map<String, dynamic> json) =>
      AppleCalendarConnectionStatus(
        connected: json['connected'] as bool,
        appleId: json['appleId'] as String?,
        selectedCalendarUrls: (json['selectedCalendarUrls'] as List<dynamic>).cast<String>(),
        lastSyncedAt: json['lastSyncedAt'] == null
            ? null
            : DateTime.parse(json['lastSyncedAt'] as String).toLocal(),
      );
}
