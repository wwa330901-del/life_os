/// 工程日報表（2026-09，顧問文件「工程執行紀錄系統」第一項）——任何專案
/// 成員都能填，一個專案一天只有一筆（同一天重複送出視為覆蓋）。先不做照
/// 片上傳，純文字：工作內容/人力/問題記錄。
class DailyReport {
  const DailyReport({
    required this.id,
    required this.reportDate,
    required this.workContent,
    required this.manpower,
    required this.issues,
    required this.submittedByName,
    required this.createdAt,
  });

  final String id;
  final DateTime reportDate;
  final String workContent;
  final int? manpower;
  final String? issues;
  final String submittedByName;
  final DateTime createdAt;

  factory DailyReport.fromJson(Map<String, dynamic> json) => DailyReport(
    id: json['id'] as String,
    reportDate: DateTime.parse(json['reportDate'] as String),
    workContent: json['workContent'] as String,
    manpower: json['manpower'] as int?,
    issues: json['issues'] as String?,
    submittedByName: (json['submittedBy'] as Map<String, dynamic>)['name'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}

/// 「今日未交日報」清單裡的一個專案（空間層級彙總，見
/// `ApiClient.missingDailyReportsToday`）。
class MissingDailyReportProject {
  const MissingDailyReportProject({
    required this.projectId,
    required this.projectName,
    required this.pmName,
  });

  final String projectId;
  final String projectName;
  final String? pmName;

  factory MissingDailyReportProject.fromJson(Map<String, dynamic> json) => MissingDailyReportProject(
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    pmName: json['pmName'] as String?,
  );
}
