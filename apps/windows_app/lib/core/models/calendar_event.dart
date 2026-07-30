/// One event on a 行事曆空間's calendar — independent of ProjectTodo (see
/// CalendarScreen for how the two are shown together, read-only for todos).
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
  });

  final String id;
  final String title;
  final DateTime startAt;
  final DateTime? endAt;
  final bool allDay;
  final String? location;
  final String? notes;
  final String? googleEventId;

  factory CalendarEvent.fromJson(Map<String, dynamic> json) => CalendarEvent(
    id: json['id'] as String,
    title: json['title'] as String,
    startAt: DateTime.parse(json['startAt'] as String).toLocal(),
    endAt: json['endAt'] == null ? null : DateTime.parse(json['endAt'] as String).toLocal(),
    allDay: json['allDay'] as bool,
    location: json['location'] as String?,
    notes: json['notes'] as String?,
    googleEventId: json['googleEventId'] as String?,
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
