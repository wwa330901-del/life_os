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
/// task with no duration, optionally assigned to a project member. Every
/// todo has exactly one of dueDate/isOngoing set (2026-08-03 rule) — a
/// pre-existing item from before that rule can have neither, which is why
/// both fields stay nullable/false-able here rather than one being
/// required.
class ProjectTodo {
  const ProjectTodo({
    required this.id,
    required this.title,
    required this.done,
    required this.completedAt,
    required this.dueDate,
    required this.isOngoing,
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
  final bool isOngoing;
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
    isOngoing: json['isOngoing'] as bool? ?? false,
    priority: TodoPriorityJson.fromJson(json['priority'] as String),
    notes: json['notes'] as String?,
    assigneeUserId: json['assigneeUserId'] as String?,
    sortOrder: json['sortOrder'] as int,
  );
}

/// One project's worth of 工作代辦事項, as grouped by `GET /todos`.
class WorkProjectTodos {
  const WorkProjectTodos({
    required this.projectId,
    required this.projectName,
    required this.spaceName,
    required this.todos,
  });

  final String projectId;
  final String projectName;
  final String spaceName;
  final List<ProjectTodo> todos;

  factory WorkProjectTodos.fromJson(Map<String, dynamic> json) => WorkProjectTodos(
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    spaceName: json['spaceName'] as String,
    todos: (json['todos'] as List)
        .map((e) => ProjectTodo.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// The unified 代辦事項 screen's data — 個人 as a flat list, 工作 grouped by
/// project (one entry per project the caller belongs to).
class TodoOverview {
  const TodoOverview({required this.personal, required this.work});

  final List<ProjectTodo> personal;
  final List<WorkProjectTodos> work;

  factory TodoOverview.fromJson(Map<String, dynamic> json) => TodoOverview(
    personal: (json['personal'] as List)
        .map((e) => ProjectTodo.fromJson(e as Map<String, dynamic>))
        .toList(),
    work: (json['work'] as List)
        .map((e) => WorkProjectTodos.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// One row of the 已完成代辦事項 history tab — `GET /todos/completed` returns
/// 個人 and 工作 items flattened into one list (unlike `TodoOverview`, which
/// groups 工作 by project), so each row carries its own project/space name
/// (both null for a 個人 item) instead of relying on which bucket it's in.
class CompletedTodoEntry {
  const CompletedTodoEntry({required this.todo, this.projectName, this.spaceName});

  final ProjectTodo todo;
  final String? projectName;
  final String? spaceName;

  factory CompletedTodoEntry.fromJson(Map<String, dynamic> json) => CompletedTodoEntry(
    todo: ProjectTodo.fromJson(json),
    projectName: json['projectName'] as String?,
    spaceName: json['spaceName'] as String?,
  );
}

/// One page of a cursor-paginated `/todos/completed` fetch — `nextCursor`
/// is null once there's nothing more to load.
class CompletedTodosPage {
  const CompletedTodosPage({required this.items, required this.nextCursor});

  final List<CompletedTodoEntry> items;
  final String? nextCursor;

  factory CompletedTodosPage.fromJson(Map<String, dynamic> json) => CompletedTodosPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => CompletedTodoEntry.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}
