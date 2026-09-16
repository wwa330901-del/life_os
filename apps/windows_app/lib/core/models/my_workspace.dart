/// 個人工作站（2026-09，顧問文件橫向基礎建設 A 子項）——公司空間任何成
/// 員都能看自己的，不受 OWNER-only 限制。見後端
/// `apps/api/src/my-workspace/my-workspace.service.ts`。
library;

import 'project.dart' show ProjectStage, projectStageFromJson;
import 'project_todo.dart' show TodoPriority, TodoPriorityJson;

class MyWorkspaceProjectStatus {
  const MyWorkspaceProjectStatus({
    required this.projectId,
    required this.projectName,
    required this.stage,
    required this.dailyReportSubmittedToday,
    required this.weeklyReportSubmittedThisWeek,
  });

  final String projectId;
  final String projectName;
  final ProjectStage stage;
  final bool dailyReportSubmittedToday;
  final bool weeklyReportSubmittedThisWeek;

  factory MyWorkspaceProjectStatus.fromJson(Map<String, dynamic> json) => MyWorkspaceProjectStatus(
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    stage: projectStageFromJson(json['stage'] as String),
    dailyReportSubmittedToday: json['dailyReportSubmittedToday'] as bool,
    weeklyReportSubmittedThisWeek: json['weeklyReportSubmittedThisWeek'] as bool,
  );
}

class MyWorkspaceTodo {
  const MyWorkspaceTodo({
    required this.id,
    required this.title,
    required this.dueDate,
    required this.priority,
    required this.projectId,
    required this.projectName,
  });

  final String id;
  final String title;
  final DateTime? dueDate;
  final TodoPriority priority;
  final String? projectId;
  final String? projectName;

  factory MyWorkspaceTodo.fromJson(Map<String, dynamic> json) => MyWorkspaceTodo(
    id: json['id'] as String,
    title: json['title'] as String,
    dueDate: json['dueDate'] != null ? DateTime.parse(json['dueDate'] as String) : null,
    priority: TodoPriorityJson.fromJson(json['priority'] as String),
    projectId: json['projectId'] as String?,
    projectName: json['projectName'] as String?,
  );
}

class MyWorkspacePendingReview {
  const MyWorkspacePendingReview({
    required this.id,
    required this.materialName,
    required this.submittedDate,
    required this.projectId,
    required this.projectName,
    required this.submittedByName,
  });

  final String id;
  final String materialName;
  final DateTime submittedDate;
  final String projectId;
  final String projectName;
  final String submittedByName;

  factory MyWorkspacePendingReview.fromJson(Map<String, dynamic> json) => MyWorkspacePendingReview(
    id: json['id'] as String,
    materialName: json['materialName'] as String,
    submittedDate: DateTime.parse(json['submittedDate'] as String),
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    submittedByName: json['submittedByName'] as String,
  );
}

class MyWorkspace {
  const MyWorkspace({required this.myProjects, required this.myTodos, required this.myPendingReviews});

  final List<MyWorkspaceProjectStatus> myProjects;
  final List<MyWorkspaceTodo> myTodos;
  final List<MyWorkspacePendingReview> myPendingReviews;

  factory MyWorkspace.fromJson(Map<String, dynamic> json) => MyWorkspace(
    myProjects: (json['myProjects'] as List<dynamic>)
        .map((e) => MyWorkspaceProjectStatus.fromJson(e as Map<String, dynamic>))
        .toList(),
    myTodos: (json['myTodos'] as List<dynamic>).map((e) => MyWorkspaceTodo.fromJson(e as Map<String, dynamic>)).toList(),
    myPendingReviews: (json['myPendingReviews'] as List<dynamic>)
        .map((e) => MyWorkspacePendingReview.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
