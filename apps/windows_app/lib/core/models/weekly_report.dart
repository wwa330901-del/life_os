/// 工程週報表（2026-09，顧問文件「工程執行紀錄系統」第二項）——跟日報表
/// 同一套 upsert 慣例，一個專案一週只有一筆（同一週重複送出視為覆蓋）。
class WeeklyReport {
  const WeeklyReport({
    required this.id,
    required this.weekStartDate,
    required this.summary,
    required this.nextWeekPlan,
    required this.issues,
    required this.submittedByName,
    required this.createdAt,
  });

  final String id;
  final DateTime weekStartDate;
  final String summary;
  final String? nextWeekPlan;
  final String? issues;
  final String submittedByName;
  final DateTime createdAt;

  factory WeeklyReport.fromJson(Map<String, dynamic> json) => WeeklyReport(
    id: json['id'] as String,
    weekStartDate: DateTime.parse(json['weekStartDate'] as String),
    summary: json['summary'] as String,
    nextWeekPlan: json['nextWeekPlan'] as String?,
    issues: json['issues'] as String?,
    submittedByName: (json['submittedBy'] as Map<String, dynamic>)['name'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}

/// 「本週未交週報」清單裡的一個專案（空間層級彙總，見
/// `ApiClient.missingWeeklyReportsThisWeek`）。
class MissingWeeklyReportProject {
  const MissingWeeklyReportProject({
    required this.projectId,
    required this.projectName,
    required this.pmName,
  });

  final String projectId;
  final String projectName;
  final String? pmName;

  factory MissingWeeklyReportProject.fromJson(Map<String, dynamic> json) => MissingWeeklyReportProject(
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    pmName: json['pmName'] as String?,
  );
}
