enum MaterialSubmissionStatus {
  pending,
  approved,
  rejected;

  static MaterialSubmissionStatus fromJson(String value) => switch (value) {
    'PENDING' => MaterialSubmissionStatus.pending,
    'APPROVED' => MaterialSubmissionStatus.approved,
    'REJECTED' => MaterialSubmissionStatus.rejected,
    _ => throw ArgumentError('Unknown MaterialSubmissionStatus: $value'),
  };

  String toJson() => switch (this) {
    MaterialSubmissionStatus.pending => 'PENDING',
    MaterialSubmissionStatus.approved => 'APPROVED',
    MaterialSubmissionStatus.rejected => 'REJECTED',
  };

  String get label => switch (this) {
    MaterialSubmissionStatus.pending => '待審核',
    MaterialSubmissionStatus.approved => '已核准',
    MaterialSubmissionStatus.rejected => '已駁回',
  };
}

/// 材料送審（2026-09，顧問文件「工程執行紀錄系統」第五項）——單一送審
/// 人→單一審核結果的輕量流程，不是 DocumentApproval 那套多關卡簽核鏈。
class MaterialSubmission {
  const MaterialSubmission({
    required this.id,
    required this.materialName,
    required this.spec,
    required this.vendorName,
    required this.status,
    required this.submittedDate,
    required this.reviewedDate,
    required this.reviewComment,
    required this.submittedByName,
    required this.reviewedByName,
  });

  final String id;
  final String materialName;
  final String? spec;
  final String? vendorName;
  final MaterialSubmissionStatus status;
  final DateTime submittedDate;
  final DateTime? reviewedDate;
  final String? reviewComment;
  final String submittedByName;
  final String? reviewedByName;

  factory MaterialSubmission.fromJson(Map<String, dynamic> json) => MaterialSubmission(
    id: json['id'] as String,
    materialName: json['materialName'] as String,
    spec: json['spec'] as String?,
    vendorName: (json['vendor'] as Map<String, dynamic>?)?['name'] as String?,
    status: MaterialSubmissionStatus.fromJson(json['status'] as String),
    submittedDate: DateTime.parse(json['submittedDate'] as String),
    reviewedDate: json['reviewedDate'] != null ? DateTime.parse(json['reviewedDate'] as String) : null,
    reviewComment: json['reviewComment'] as String?,
    submittedByName: (json['submittedBy'] as Map<String, dynamic>)['name'] as String,
    reviewedByName: (json['reviewedBy'] as Map<String, dynamic>?)?['name'] as String?,
  );
}
