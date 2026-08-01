enum DocumentApprovalStatus { pending, approved, rejected }

extension DocumentApprovalStatusJson on DocumentApprovalStatus {
  static DocumentApprovalStatus fromJson(String value) => switch (value) {
    'APPROVED' => DocumentApprovalStatus.approved,
    'REJECTED' => DocumentApprovalStatus.rejected,
    _ => DocumentApprovalStatus.pending,
  };

  String get label => switch (this) {
    DocumentApprovalStatus.pending => '待審核',
    DocumentApprovalStatus.approved => '已核准',
    DocumentApprovalStatus.rejected => '已退回',
  };
}

enum DocumentApprovalStepNoteType { requestInfo, reply }

extension DocumentApprovalStepNoteTypeJson on DocumentApprovalStepNoteType {
  static DocumentApprovalStepNoteType fromJson(String value) =>
      value == 'REPLY' ? DocumentApprovalStepNoteType.reply : DocumentApprovalStepNoteType.requestInfo;
}

/// One entry in a step's "審核人提問／承辦人回覆" thread — never changes the
/// step's own status, purely informational back-and-forth before a real
/// APPROVE/REJECT decision.
class DocumentApprovalStepNote {
  const DocumentApprovalStepNote({
    required this.id,
    required this.authorUserId,
    required this.type,
    required this.text,
    required this.createdAt,
  });

  final String id;
  final String authorUserId;
  final DocumentApprovalStepNoteType type;
  final String text;
  final DateTime createdAt;

  factory DocumentApprovalStepNote.fromJson(Map<String, dynamic> json) => DocumentApprovalStepNote(
    id: json['id'] as String,
    authorUserId: json['authorUserId'] as String,
    type: DocumentApprovalStepNoteTypeJson.fromJson(json['type'] as String),
    text: json['text'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class DocumentApprovalStepDetail {
  const DocumentApprovalStepDetail({
    required this.id,
    required this.sequence,
    required this.approverUserId,
    required this.approverName,
    required this.status,
    required this.decisionComment,
    required this.decidedAt,
    required this.notes,
  });

  final String id;
  final int sequence;
  final String approverUserId;
  final String approverName;
  final DocumentApprovalStatus status;
  final String? decisionComment;
  final DateTime? decidedAt;
  final List<DocumentApprovalStepNote> notes;

  factory DocumentApprovalStepDetail.fromJson(Map<String, dynamic> json) => DocumentApprovalStepDetail(
    id: json['id'] as String,
    sequence: json['sequence'] as int,
    approverUserId: json['approverUserId'] as String,
    approverName: json['approverName'] as String,
    status: DocumentApprovalStatusJson.fromJson(json['status'] as String),
    decisionComment: json['decisionComment'] as String?,
    decidedAt: json['decidedAt'] == null ? null : DateTime.parse(json['decidedAt'] as String),
    notes: (json['notes'] as List<dynamic>)
        .map((e) => DocumentApprovalStepNote.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// One 送簽 attempt for a GeneratedDocument, with every step's full detail —
/// what both 我送出的 (submitter's view) and a document's 簽核歷程 render.
class DocumentApprovalSummary {
  const DocumentApprovalSummary({
    required this.id,
    required this.documentId,
    required this.documentName,
    required this.projectId,
    required this.submittedByUserId,
    required this.status,
    required this.createdAt,
    required this.steps,
  });

  final String id;
  final String documentId;
  final String documentName;
  final String projectId;
  final String submittedByUserId;
  final DocumentApprovalStatus status;
  final DateTime createdAt;
  final List<DocumentApprovalStepDetail> steps;

  factory DocumentApprovalSummary.fromJson(Map<String, dynamic> json) => DocumentApprovalSummary(
    id: json['id'] as String,
    documentId: json['documentId'] as String,
    documentName: json['documentName'] as String,
    projectId: json['projectId'] as String,
    submittedByUserId: json['submittedByUserId'] as String,
    status: DocumentApprovalStatusJson.fromJson(json['status'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    steps: (json['steps'] as List<dynamic>)
        .map((e) => DocumentApprovalStepDetail.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// One row of 待我簽核 — a step currently awaiting this user's action
/// specifically (already filtered server-side to "it's your turn").
class PendingApprovalStep {
  const PendingApprovalStep({
    required this.stepId,
    required this.sequence,
    required this.totalSteps,
    required this.documentId,
    required this.documentName,
    required this.projectId,
    required this.submittedByUserId,
    required this.submittedByName,
    required this.createdAt,
  });

  final String stepId;
  final int sequence;
  final int totalSteps;
  final String documentId;
  final String documentName;
  final String projectId;
  final String submittedByUserId;
  final String submittedByName;
  final DateTime createdAt;

  factory PendingApprovalStep.fromJson(Map<String, dynamic> json) => PendingApprovalStep(
    stepId: json['stepId'] as String,
    sequence: json['sequence'] as int,
    totalSteps: json['totalSteps'] as int,
    documentId: json['documentId'] as String,
    documentName: json['documentName'] as String,
    projectId: json['projectId'] as String,
    submittedByUserId: json['submittedByUserId'] as String,
    submittedByName: json['submittedByName'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}
