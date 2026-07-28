/// A document actually generated from a [DocumentTemplate] for a project —
/// the persisted result of filling in a template's fields, kept as a
/// record inside the app rather than a one-shot download (see
/// `GeneratedDocument` in schema.prisma). `values` is a snapshot of what
/// was filled in, so it stays readable even if the template it came from
/// is later edited or removed. The rendered `.docx` bytes themselves aren't
/// part of this model — fetch them separately via the `.../download`
/// endpoint when the user actually wants to save/print.
class GeneratedDocument {
  const GeneratedDocument({
    required this.id,
    required this.projectId,
    required this.templateId,
    required this.name,
    required this.values,
    required this.createdAt,
    required this.createdByUserId,
  });

  final String id;
  final String projectId;
  final String? templateId;
  final String name;
  final Map<String, dynamic> values;
  final DateTime createdAt;
  final String? createdByUserId;

  factory GeneratedDocument.fromJson(Map<String, dynamic> json) => GeneratedDocument(
    id: json['id'] as String,
    projectId: json['projectId'] as String,
    templateId: json['templateId'] as String?,
    name: json['name'] as String,
    values: (json['values'] as Map<String, dynamic>?) ?? const {},
    createdAt: DateTime.parse(json['createdAt'] as String),
    createdByUserId: json['createdByUserId'] as String?,
  );
}
