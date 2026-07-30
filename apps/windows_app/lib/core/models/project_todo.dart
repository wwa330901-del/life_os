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

/// A project-level to-do item — distinct from 工項 (WorkItem, which is
/// schedule/duration-bearing and feeds the Gantt engine); a todo is a plain
/// task with no duration, optionally assigned to a project member.
class ProjectTodo {
  const ProjectTodo({
    required this.id,
    required this.title,
    required this.done,
    required this.completedAt,
    required this.dueDate,
    required this.priority,
    required this.notes,
    required this.assigneeUserId,
    required this.sortOrder,
  });

  final String id;
  final String title;
  final bool done;
  final DateTime? completedAt;
  final DateTime? dueDate;
  final TodoPriority priority;
  final String? notes;
  final String? assigneeUserId;
  final int sortOrder;

  factory ProjectTodo.fromJson(Map<String, dynamic> json) => ProjectTodo(
    id: json['id'] as String,
    title: json['title'] as String,
    done: json['done'] as bool,
    completedAt: json['completedAt'] == null ? null : DateTime.parse(json['completedAt'] as String),
    dueDate: json['dueDate'] == null ? null : DateTime.parse(json['dueDate'] as String),
    priority: TodoPriorityJson.fromJson(json['priority'] as String),
    notes: json['notes'] as String?,
    assigneeUserId: json['assigneeUserId'] as String?,
    sortOrder: json['sortOrder'] as int,
  );
}
