import 'holiday_calendar.dart';
import 'project_property.dart';

/// One 類型/狀態 dropdown option from the old platform-wide admin system
/// (`apps/api/src/projects/project-options.service.ts`) — superseded by the
/// per-space [PropertyDefinition]/[PropertyOption] system, but the old
/// tables/endpoints/admin screen are still around (stage-2 cleanup, not yet
/// done), so this stays until that's removed.
/// One 專案 under a company space. The backend's Project row also carries
/// the holiday calendar fields flattened onto it (see schema.prisma) — this
/// client model embeds them as a [HolidayCalendar] for convenience, same
/// shape reno_pm's Gantt widgets expect.
///
/// Project-info fields (類型/狀態/業主名稱/... or whatever else a space has
/// defined) are no longer fixed columns — each space defines its own set of
/// properties (see `project_properties_provider.dart`), and a project just
/// carries a value per definition in [propertyValues]. The backend still
/// returns the old fixed `type`/`status` fields too (a stage-1 safety net),
/// but nothing on the client reads them anymore.
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

  const Project({
    required this.id,
    required this.name,
    required this.projectStartDate,
    this.projectEndDate,
    required this.calendar,
    required this.spaceId,
    required this.propertyValues,
    this.pmName,
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
  );
}
