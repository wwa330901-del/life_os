import 'holiday_calendar.dart';

/// One 類型/狀態 dropdown option — platform-admin-managed, shared by every
/// space (see `apps/api/src/projects/project-options.service.ts`).
class ProjectOption {
  const ProjectOption({required this.id, required this.label});

  final String id;
  final String label;

  factory ProjectOption.fromJson(Map<String, dynamic> json) =>
      ProjectOption(id: json['id'] as String, label: json['label'] as String);
}

/// One 專案 under a company space. The backend's Project row also carries
/// the holiday calendar fields flattened onto it (see schema.prisma) — this
/// client model embeds them as a [HolidayCalendar] for convenience, same
/// shape reno_pm's Gantt widgets expect.
class Project {
  final String id;
  final String name;
  final String clientName;
  final String siteAddress;
  final String? caseNumber;
  final ProjectOption type;
  final ProjectOption status;
  final DateTime projectStartDate;
  final HolidayCalendar calendar;
  final String spaceId;

  /// Only populated by `GET /spaces/:id/projects` (the project list card
  /// needs "who's responsible"); null on every other endpoint that returns
  /// a Project.
  final String? pmName;

  const Project({
    required this.id,
    required this.name,
    required this.clientName,
    required this.siteAddress,
    this.caseNumber,
    required this.type,
    required this.status,
    required this.projectStartDate,
    required this.calendar,
    required this.spaceId,
    this.pmName,
  });

  factory Project.fromJson(Map<String, dynamic> json) => Project(
    id: json['id'] as String,
    name: json['name'] as String,
    clientName: json['clientName'] as String,
    siteAddress: json['siteAddress'] as String,
    caseNumber: json['caseNumber'] as String?,
    type: ProjectOption.fromJson(json['type'] as Map<String, dynamic>),
    status: ProjectOption.fromJson(json['status'] as Map<String, dynamic>),
    projectStartDate: DateTime.parse(json['projectStartDate'] as String),
    calendar: HolidayCalendar.fromProjectJson(json),
    spaceId: json['spaceId'] as String,
    pmName: json['pmName'] as String?,
  );
}
