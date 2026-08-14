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
    required this.roleLabel,
    required this.approverUserId,
    required this.approverName,
    required this.status,
    required this.decisionComment,
    required this.decidedAt,
    required this.notes,
  });

  final String id;
  final int sequence;

  /// 固定關卡職稱（「業務主管」「成控」…）——只有工程財務三張表的簽核目標
  /// 才有；GeneratedDocument 的自由排序簽核鏈沒有這個，是 null。
  final String? roleLabel;
  final String approverUserId;
  final String approverName;
  final DocumentApprovalStatus status;
  final String? decisionComment;
  final DateTime? decidedAt;
  final List<DocumentApprovalStepNote> notes;

  factory DocumentApprovalStepDetail.fromJson(Map<String, dynamic> json) => DocumentApprovalStepDetail(
    id: json['id'] as String,
    sequence: json['sequence'] as int,
    roleLabel: json['roleLabel'] as String?,
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

/// 簽核目標的四種型別，跟後端 `ApprovalTargetType` 一致——2026-08-14 從
/// 「只能是 GeneratedDocument」泛化成這四種，工程財務三張表都掛在這裡。
enum ApprovalTargetType { generatedDocument, costControlInitialSheet, procurementComparison, paymentRequestPeriod }

extension ApprovalTargetTypeJson on ApprovalTargetType {
  static ApprovalTargetType fromJson(String value) => switch (value) {
    'COST_CONTROL_INITIAL_SHEET' => ApprovalTargetType.costControlInitialSheet,
    'PROCUREMENT_COMPARISON' => ApprovalTargetType.procurementComparison,
    'PAYMENT_REQUEST_PERIOD' => ApprovalTargetType.paymentRequestPeriod,
    _ => ApprovalTargetType.generatedDocument,
  };
}

/// One 送簽 attempt for one target（四種之一），with every step's full
/// detail —— what both 我送出的 (submitter's view) and 簽核歷程 view 會渲染。
class DocumentApprovalSummary {
  const DocumentApprovalSummary({
    required this.id,
    required this.targetType,
    required this.targetId,
    required this.targetDisplayName,
    required this.submittedByUserId,
    required this.status,
    required this.createdAt,
    required this.steps,
  });

  final String id;
  final ApprovalTargetType targetType;
  final String targetId;
  final String targetDisplayName;
  final String submittedByUserId;
  final DocumentApprovalStatus status;
  final DateTime createdAt;
  final List<DocumentApprovalStepDetail> steps;

  factory DocumentApprovalSummary.fromJson(Map<String, dynamic> json) => DocumentApprovalSummary(
    id: json['id'] as String,
    targetType: ApprovalTargetTypeJson.fromJson(json['targetType'] as String),
    targetId: json['targetId'] as String,
    targetDisplayName: json['targetDisplayName'] as String,
    submittedByUserId: json['submittedByUserId'] as String,
    status: DocumentApprovalStatusJson.fromJson(json['status'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
    steps: (json['steps'] as List<dynamic>)
        .map((e) => DocumentApprovalStepDetail.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}

/// One page of a cursor-paginated `GET /document-approvals/mine` fetch —
/// `nextCursor` is null once there's nothing more to load.
class DocumentApprovalsPage {
  const DocumentApprovalsPage({required this.items, required this.nextCursor});

  final List<DocumentApprovalSummary> items;
  final String? nextCursor;

  factory DocumentApprovalsPage.fromJson(Map<String, dynamic> json) => DocumentApprovalsPage(
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => DocumentApprovalSummary.fromJson(e as Map<String, dynamic>))
        .toList(),
    nextCursor: json['nextCursor'] as String?,
  );
}

/// One row of 待我簽核 — a step currently awaiting this user's action
/// specifically (already filtered server-side to "it's your turn").
class PendingApprovalStep {
  const PendingApprovalStep({
    required this.stepId,
    required this.sequence,
    required this.roleLabel,
    required this.totalSteps,
    required this.targetType,
    required this.targetId,
    required this.targetDisplayName,
    required this.projectId,
    required this.submittedByUserId,
    required this.submittedByName,
    required this.createdAt,
  });

  final String stepId;
  final int sequence;
  final String? roleLabel;
  final int totalSteps;
  final ApprovalTargetType targetType;
  final String targetId;
  final String targetDisplayName;
  final String projectId;
  final String submittedByUserId;
  final String submittedByName;
  final DateTime createdAt;

  factory PendingApprovalStep.fromJson(Map<String, dynamic> json) => PendingApprovalStep(
    stepId: json['stepId'] as String,
    sequence: json['sequence'] as int,
    roleLabel: json['roleLabel'] as String?,
    totalSteps: json['totalSteps'] as int,
    targetType: ApprovalTargetTypeJson.fromJson(json['targetType'] as String),
    targetId: json['targetId'] as String,
    targetDisplayName: json['targetDisplayName'] as String,
    projectId: json['projectId'] as String,
    submittedByUserId: json['submittedByUserId'] as String,
    submittedByName: json['submittedByName'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}
