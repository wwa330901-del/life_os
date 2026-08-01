import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/document_approval.dart';
import 'auth_provider.dart';

typedef DocumentApprovalsQuery = ({String projectId, String documentId});

/// Every 送簽 attempt (including past rejected ones) for one specific
/// GeneratedDocument — what a document's own 簽核歷程 view renders.
final documentApprovalsProvider = FutureProvider.family<List<DocumentApprovalSummary>, DocumentApprovalsQuery>((
  ref,
  query,
) {
  return ref
      .read(apiClientProvider)
      .listDocumentApprovals(projectId: query.projectId, documentId: query.documentId);
});

/// Cross-project — every step currently awaiting the caller's own action.
/// The "簽核" screen's 待我簽核 tab.
final pendingApprovalsProvider = FutureProvider.autoDispose<List<PendingApprovalStep>>((ref) {
  return ref.read(apiClientProvider).listPendingApprovals();
});

/// Cross-project — every approval the caller has submitted, with full
/// step/note detail. The "簽核" screen's 我送出的 tab.
final myApprovalSubmissionsProvider = FutureProvider.autoDispose<List<DocumentApprovalSummary>>((ref) {
  return ref.read(apiClientProvider).listMyApprovalSubmissions();
});
