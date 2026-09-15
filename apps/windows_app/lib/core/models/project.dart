import 'client.dart';
import 'holiday_calendar.dart';
import 'project_property.dart';

/// 案件類型（2026-09 案件類型分流＋九大階段狀態機）— reuses the schema slot
/// the old dead `typeId` used to occupy. Three values, not the consultant
/// doc's plain two, because a real existing local-dev category (設計工程混合
/// 案) didn't fit the binary split and the user chose to keep it as a third
/// value rather than force-collapse it.
enum ProjectCaseType { design, engineering, designEngineering }

ProjectCaseType projectCaseTypeFromJson(String value) => switch (value) {
  'DESIGN' => ProjectCaseType.design,
  'ENGINEERING' => ProjectCaseType.engineering,
  'DESIGN_ENGINEERING' => ProjectCaseType.designEngineering,
  _ => throw ArgumentError('Unknown ProjectCaseType: $value'),
};

String projectCaseTypeToJson(ProjectCaseType type) => switch (type) {
  ProjectCaseType.design => 'DESIGN',
  ProjectCaseType.engineering => 'ENGINEERING',
  ProjectCaseType.designEngineering => 'DESIGN_ENGINEERING',
};

String projectCaseTypeLabel(ProjectCaseType type) => switch (type) {
  ProjectCaseType.design => '設計案',
  ProjectCaseType.engineering => '工程案',
  ProjectCaseType.designEngineering => '設計工程混合案',
};

/// 全案九大階段，固定順序（`ProjectStage.values` here matches the backend's
/// `STAGE_ORDER` — keep them declared in the same order if either ever
/// changes). Only advances forward, one step at a time, via
/// `POST /projects/:id/advance-stage` — never set directly by picking a
/// value out of order.
enum ProjectStage {
  businessContact,
  designContract,
  designPhase,
  engineeringQuotation,
  engineeringContract,
  preparation,
  procurement,
  construction,
  completionSettlement,
}

ProjectStage projectStageFromJson(String value) => switch (value) {
  'BUSINESS_CONTACT' => ProjectStage.businessContact,
  'DESIGN_CONTRACT' => ProjectStage.designContract,
  'DESIGN_PHASE' => ProjectStage.designPhase,
  'ENGINEERING_QUOTATION' => ProjectStage.engineeringQuotation,
  'ENGINEERING_CONTRACT' => ProjectStage.engineeringContract,
  'PREPARATION' => ProjectStage.preparation,
  'PROCUREMENT' => ProjectStage.procurement,
  'CONSTRUCTION' => ProjectStage.construction,
  'COMPLETION_SETTLEMENT' => ProjectStage.completionSettlement,
  _ => throw ArgumentError('Unknown ProjectStage: $value'),
};

String projectStageLabel(ProjectStage stage) => switch (stage) {
  ProjectStage.businessContact => '業務接洽',
  ProjectStage.designContract => '設計簽約',
  ProjectStage.designPhase => '設計階段',
  ProjectStage.engineeringQuotation => '工程估價',
  ProjectStage.engineeringContract => '工程簽約',
  ProjectStage.preparation => '前置作業',
  ProjectStage.procurement => '發包作業',
  ProjectStage.construction => '施工作業',
  ProjectStage.completionSettlement => '完工驗收・結算保固',
};

/// One 專案 under a company space. The backend's Project row also carries
/// the holiday calendar fields flattened onto it (see schema.prisma) — this
/// client model embeds them as a [HolidayCalendar] for convenience, same
/// shape reno_pm's Gantt widgets expect.
///
/// Project-info fields (業主名稱/... or whatever else a space has defined)
/// are no longer fixed columns — each space defines its own set of
/// properties (see `project_properties_provider.dart`), and a project just
/// carries a value per definition in [propertyValues]. `caseType`/`stage`/
/// `skipDesignPhase` above are the exception — those genuinely are fixed
/// columns again (2026-09), since they drive real cross-space automation
/// (顧問文件's 九大階段流程) rather than being per-space free-form data.
class Project {
  final String id;
  final String name;
  final DateTime projectStartDate;

  /// 預計結案日 (target/contract completion date) — null until a
  /// 完工日-bearing contract is filled (see DocumentField's `writesTo`) or
  /// the user sets it directly on the 專案資料 tab. The schedule engine
  /// warns when the computed finish date slips past this.
  final DateTime? projectEndDate;
  final HolidayCalendar calendar;
  final String spaceId;
  final List<ProjectPropertyValue> propertyValues;

  /// Only populated by `GET /spaces/:id/projects` (the project list card
  /// needs "who's responsible"); null on every other endpoint that returns
  /// a Project.
  final String? pmName;

  /// Null until the user assigns one — no default, unlike [stage].
  final ProjectCaseType? caseType;
  final ProjectStage stage;
  final bool skipDesignPhase;

  /// 2026-09 — nullable only because projects created before this feature
  /// have none; every project created from now on always has one (see
  /// `CreateProjectDto.clientId`, required, not optional).
  final Client? client;

  const Project({
    required this.id,
    required this.name,
    required this.projectStartDate,
    this.projectEndDate,
    required this.calendar,
    required this.spaceId,
    required this.propertyValues,
    this.pmName,
    this.caseType,
    required this.stage,
    required this.skipDesignPhase,
    this.client,
  });

  /// Looks up this project's value for the property named [name] within
  /// its space's own definitions (e.g. "類型", "狀態") — gracefully returns
  /// null if this space never defined a property by that name.
  ProjectPropertyValue? propertyByName(String name) {
    for (final value in propertyValues) {
      if (value.definitionName == name) return value;
    }
    return null;
  }

  /// Looks up this project's value for a specific property definition by
  /// id — null if this project has never had a value set for it (e.g. a
  /// property added to the space after this project was created).
  ProjectPropertyValue? propertyValue(String definitionId) {
    for (final value in propertyValues) {
      if (value.definitionId == definitionId) return value;
    }
    return null;
  }

  factory Project.fromJson(Map<String, dynamic> json) => Project(
    id: json['id'] as String,
    name: json['name'] as String,
    projectStartDate: DateTime.parse(json['projectStartDate'] as String),
    projectEndDate: json['projectEndDate'] == null
        ? null
        : DateTime.parse(json['projectEndDate'] as String),
    calendar: HolidayCalendar.fromProjectJson(json),
    spaceId: json['spaceId'] as String,
    propertyValues: (json['propertyValues'] as List<dynamic>? ?? const [])
        .map((e) => ProjectPropertyValue.fromJson(e as Map<String, dynamic>))
        .toList(),
    pmName: json['pmName'] as String?,
    caseType: json['caseType'] == null
        ? null
        : projectCaseTypeFromJson(json['caseType'] as String),
    stage: projectStageFromJson(json['stage'] as String),
    skipDesignPhase: json['skipDesignPhase'] as bool,
    client: json['client'] == null
        ? null
        : Client.fromJson(json['client'] as Map<String, dynamic>),
  );
}

/// Lightweight cross-space project reference from `GET /projects/mine` —
/// every project this user is a member of, regardless of which company
/// space it's in. Used by pickers that need "any of my projects" without
/// already knowing which space to look in (e.g. 記帳's 代墊-to-project
/// link) — the full [Project] model always requires a known spaceId to
/// fetch, this doesn't.
class MyProjectSummary {
  const MyProjectSummary({required this.id, required this.name, required this.spaceName});

  final String id;
  final String name;
  final String spaceName;

  factory MyProjectSummary.fromJson(Map<String, dynamic> json) => MyProjectSummary(
    id: json['id'] as String,
    name: json['name'] as String,
    spaceName: json['spaceName'] as String,
  );
}
