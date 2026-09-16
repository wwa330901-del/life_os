/// 監控儀表板（2026-09，顧問文件唯一整個模組空白的項目）——純唯讀彙總，
/// 四個區塊互相獨立，任何一塊在後端算失敗都會是 null，不影響其他區塊
/// 正常顯示。見後端 `apps/api/src/dashboard/dashboard.service.ts`。
library;

import 'project.dart'
    show ProjectCaseType, ProjectStage, projectCaseTypeFromJson, projectCaseTypeLabel, projectStageFromJson, projectStageLabel;

class GeneralManagerView {
  const GeneralManagerView({
    required this.projectCountByStage,
    required this.missingDailyReportProjectCount,
    required this.pendingMaterialSubmissionCount,
    required this.recentFieldChangeCount,
  });

  final Map<ProjectStage, int> projectCountByStage;
  final int missingDailyReportProjectCount;
  final int pendingMaterialSubmissionCount;
  final int recentFieldChangeCount;

  factory GeneralManagerView.fromJson(Map<String, dynamic> json) {
    final raw = json['projectCountByStage'] as Map<String, dynamic>;
    return GeneralManagerView(
      projectCountByStage: {for (final entry in raw.entries) projectStageFromJson(entry.key): entry.value as int},
      missingDailyReportProjectCount: json['missingDailyReportProjectCount'] as int,
      pendingMaterialSubmissionCount: json['pendingMaterialSubmissionCount'] as int,
      recentFieldChangeCount: json['recentFieldChangeCount'] as int,
    );
  }
}

class DepartmentDashboardEntry {
  const DepartmentDashboardEntry({
    required this.departmentId,
    required this.departmentName,
    required this.memberCount,
    required this.pmProjectCount,
  });

  final String departmentId;
  final String departmentName;
  final int memberCount;
  final int pmProjectCount;

  factory DepartmentDashboardEntry.fromJson(Map<String, dynamic> json) => DepartmentDashboardEntry(
    departmentId: json['departmentId'] as String,
    departmentName: json['departmentName'] as String,
    memberCount: json['memberCount'] as int,
    pmProjectCount: json['pmProjectCount'] as int,
  );
}

class ProjectDashboardEntry {
  const ProjectDashboardEntry({
    required this.projectId,
    required this.projectName,
    required this.stage,
    required this.caseType,
    required this.pmName,
    required this.dailyReportSubmittedToday,
    required this.weeklyReportSubmittedThisWeek,
  });

  final String projectId;
  final String projectName;
  final ProjectStage stage;
  final ProjectCaseType? caseType;
  final String? pmName;
  final bool dailyReportSubmittedToday;
  final bool weeklyReportSubmittedThisWeek;

  factory ProjectDashboardEntry.fromJson(Map<String, dynamic> json) => ProjectDashboardEntry(
    projectId: json['projectId'] as String,
    projectName: json['projectName'] as String,
    stage: projectStageFromJson(json['stage'] as String),
    caseType: json['caseType'] != null ? projectCaseTypeFromJson(json['caseType'] as String) : null,
    pmName: json['pmName'] as String?,
    dailyReportSubmittedToday: json['dailyReportSubmittedToday'] as bool,
    weeklyReportSubmittedThisWeek: json['weeklyReportSubmittedThisWeek'] as bool,
  );
}

class DataAnalysisView {
  const DataAnalysisView({
    required this.totalQuotationGrandTotal,
    required this.totalOwnerBillingAmount,
    required this.totalPaymentRequestAmount,
    required this.totalReceivableOutstanding,
    required this.totalPayableOutstanding,
  });

  final double totalQuotationGrandTotal;
  final double totalOwnerBillingAmount;
  final double totalPaymentRequestAmount;
  final double totalReceivableOutstanding;
  final double totalPayableOutstanding;

  factory DataAnalysisView.fromJson(Map<String, dynamic> json) => DataAnalysisView(
    totalQuotationGrandTotal: (json['totalQuotationGrandTotal'] as num).toDouble(),
    totalOwnerBillingAmount: (json['totalOwnerBillingAmount'] as num).toDouble(),
    totalPaymentRequestAmount: (json['totalPaymentRequestAmount'] as num).toDouble(),
    totalReceivableOutstanding: (json['totalReceivableOutstanding'] as num).toDouble(),
    totalPayableOutstanding: (json['totalPayableOutstanding'] as num).toDouble(),
  );
}

class SpaceDashboard {
  const SpaceDashboard({
    required this.generalManagerView,
    required this.departmentView,
    required this.projectView,
    required this.dataAnalysisView,
  });

  final GeneralManagerView? generalManagerView;
  final List<DepartmentDashboardEntry>? departmentView;
  final List<ProjectDashboardEntry>? projectView;
  final DataAnalysisView? dataAnalysisView;

  factory SpaceDashboard.fromJson(Map<String, dynamic> json) => SpaceDashboard(
    generalManagerView: json['generalManagerView'] != null
        ? GeneralManagerView.fromJson(json['generalManagerView'] as Map<String, dynamic>)
        : null,
    departmentView: (json['departmentView'] as List<dynamic>?)
        ?.map((e) => DepartmentDashboardEntry.fromJson(e as Map<String, dynamic>))
        .toList(),
    projectView: (json['projectView'] as List<dynamic>?)
        ?.map((e) => ProjectDashboardEntry.fromJson(e as Map<String, dynamic>))
        .toList(),
    dataAnalysisView: json['dataAnalysisView'] != null
        ? DataAnalysisView.fromJson(json['dataAnalysisView'] as Map<String, dynamic>)
        : null,
  );
}

const _stageLabelForOrder = ProjectStage.values;
List<MapEntry<ProjectStage, int>> orderedStageCounts(Map<ProjectStage, int> counts) =>
    [for (final stage in _stageLabelForOrder) MapEntry(stage, counts[stage] ?? 0)];

String dashboardStageLabel(ProjectStage stage) => projectStageLabel(stage);
String dashboardCaseTypeLabel(ProjectCaseType? type) => type == null ? '未設定' : projectCaseTypeLabel(type);
