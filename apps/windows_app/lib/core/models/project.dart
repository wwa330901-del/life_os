import 'holiday_calendar.dart';

/// One 專案 under a company space. The backend's Project row also carries
/// the holiday calendar fields flattened onto it (see schema.prisma) — this
/// client model embeds them as a [HolidayCalendar] for convenience, same
/// shape reno_pm's Gantt widgets expect.
class Project {
  final String id;
  final String name;
  final String? clientName;
  final String? siteAddress;
  final DateTime projectStartDate;
  final HolidayCalendar calendar;
  final String spaceId;

  const Project({
    required this.id,
    required this.name,
    this.clientName,
    this.siteAddress,
    required this.projectStartDate,
    required this.calendar,
    required this.spaceId,
  });

  factory Project.fromJson(Map<String, dynamic> json) => Project(
    id: json['id'] as String,
    name: json['name'] as String,
    clientName: json['clientName'] as String?,
    siteAddress: json['siteAddress'] as String?,
    projectStartDate: DateTime.parse(json['projectStartDate'] as String),
    calendar: HolidayCalendar.fromProjectJson(json),
    spaceId: json['spaceId'] as String,
  );
}
