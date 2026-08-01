import 'document_approval.dart';

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
    required this.latestApprovalStatus,
  });

  final String id;
  final String projectId;
  final String? templateId;
  final String name;
  final Map<String, dynamic> values;
  final DateTime createdAt;
  final String? createdByUserId;

  /// The most recent 送簽 attempt's status, or null if this document has
  /// never been submitted for approval. APPROVED means the document is
  /// locked (can't be deleted); REJECTED means it can be resubmitted fresh.
  final DocumentApprovalStatus? latestApprovalStatus;

  factory GeneratedDocument.fromJson(Map<String, dynamic> json) {
    final approvals = json['approvals'] as List<dynamic>?;
    return GeneratedDocument(
      id: json['id'] as String,
      projectId: json['projectId'] as String,
      templateId: json['templateId'] as String?,
      name: json['name'] as String,
      values: (json['values'] as Map<String, dynamic>?) ?? const {},
      createdAt: DateTime.parse(json['createdAt'] as String),
      createdByUserId: json['createdByUserId'] as String?,
      latestApprovalStatus: (approvals == null || approvals.isEmpty)
          ? null
          : DocumentApprovalStatusJson.fromJson((approvals.first as Map<String, dynamic>)['status'] as String),
    );
  }
}
