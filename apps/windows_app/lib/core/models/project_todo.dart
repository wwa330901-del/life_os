import 'calendar_event.dart';
enum TodoPriority { low, medium, high }

extension TodoPriorityJson on TodoPriority {
  static TodoPriority fromJson(String value) => switch (value) {
    'LOW' => TodoPriority.low,
    'HIGH' => TodoPriority.high,
    _ => TodoPriority.medium,
  };

  String toJson() => switch (this) {
    TodoPriority.low => 'LOW',
    TodoPriority.medium => 'MEDIUM',
    TodoPriority.high => 'HIGH',
  };

  String get label => switch (this) {
    TodoPriority.low => '低',
    TodoPriority.medium => '中',
    TodoPriority.high => '高',
  };
}

/// A 個人代辦事項 item — a plain task with no duration. Every todo has
/// exactly one of dueDate/isOngoing set (2026-08-03 rule) — a pre-existing
/// item from before that rule can have neither, which is why both fields
/// stay nullable/false-able here rather than one being required. Model name
/// kept as `ProjectTodo` (matching the API's `ProjectTodo` table, which
/// used to also carry company-space project todos before the company-space
/// split — see the backend schema comment).
class ProjectTodo {
  const ProjectTodo({
    required this.id,
    required this.title,
    required this.done,
    required this.completedAt,
    required this.dueDate,
    required this.dueDateAllDay,
    required this.isOngoing,
    required this.priority,
    required this.notes,
    required this.sortOrder,
    this.calendarSyncTarget,
  });

  final String id;
  final String title;
  final bool done;
  final DateTime? completedAt;
  final DateTime? dueDate;

  /// Whether [dueDate] carries a meaningful time-of-day — same concept as
  /// a calendar event's `allDay` (2026-08-05, added alongside the
  /// 代辦事項→行事曆 sync). True (no time) for every pre-existing todo.
  final bool dueDateAllDay;
  final bool isOngoing;
  final TodoPriority priority;
  final String? notes;
  final int sortOrder;

  /// 有日期時自動產生的行程存到哪（2026-09-30）。
  final CalendarSyncTarget? calendarSyncTarget;

  factory ProjectTodo.fromJson(Map<String, dynamic> json) => ProjectTodo(
    id: json['id'] as String,
    title: json['title'] as String,
    done: json['done'] as bool,
    completedAt: json['completedAt'] == null ? null : DateTime.parse(json['completedAt'] as String),
    dueDate: json['dueDate'] == null ? null : DateTime.parse(json['dueDate'] as String),
    dueDateAllDay: json['dueDateAllDay'] as bool? ?? true,
    isOngoing: json['isOngoing'] as bool? ?? false,
    priority: TodoPriorityJson.fromJson(json['priority'] as String),
    notes: json['notes'] as String?,
    sortOrder: json['sortOrder'] as int,
    calendarSyncTarget: CalendarSyncTargetJson.fromJson(json['calendarSyncTarget'] as String?),
  );
}

/// The 代辦事項 screen's data — a flat list of 個人 todos.
class TodoOverview {
  const TodoOverview({required this.personal});

  final List<ProjectTodo> personal;

  factory TodoOverview.fromJson(Map<String, dynamic> json) => TodoOverview(
    personal: (json['personal'] as List)
        .map((e) => ProjectTodo.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// One page of a cursor-paginated `/todos/completed` fetch — `nextCursor`
/// is null once there's nothing more to load.
class CompletedTodosPage {
  const CompletedTodosPage({required this.items, required this.nextCursor});

  final List<ProjectTodo> items;
  final String? nextCursor;

  factory CompletedTodosPage.fromJson(Map<String, dynamic> json) => CompletedTodosPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => ProjectTodo.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}
