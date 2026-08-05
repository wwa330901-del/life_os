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
/// step/note detail. The "簽核" screen's 我送出的 tab. Cursor-paginated
/// (30/page) — mirrors `KnowledgeItemsPageState`'s shape/loadMore pattern
/// (see 大系統V1.43.0), duplicated locally rather than shared.
class MyApprovalSubmissionsPageState {
  const MyApprovalSubmissionsPageState({required this.items, required this.cursor, this.isLoadingMore = false});

  final List<DocumentApprovalSummary> items;
  final String? cursor;
  final bool isLoadingMore;

  bool get hasMore => cursor != null;

  MyApprovalSubmissionsPageState copyWith({
    List<DocumentApprovalSummary>? items,
    String? cursor,
    bool? isLoadingMore,
  }) => MyApprovalSubmissionsPageState(
    items: items ?? this.items,
    cursor: cursor ?? this.cursor,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
  );
}

class MyApprovalSubmissionsNotifier extends AsyncNotifier<MyApprovalSubmissionsPageState> {
  @override
  Future<MyApprovalSubmissionsPageState> build() async {
    final page = await ref.read(apiClientProvider).listMyApprovalSubmissions();
    return MyApprovalSubmissionsPageState(items: page.items, cursor: page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.isLoadingMore) return;
    state = AsyncData(current.copyWith(isLoadingMore: true));
    final page = await ref.read(apiClientProvider).listMyApprovalSubmissions(cursor: current.cursor);
    state = AsyncData(
      MyApprovalSubmissionsPageState(items: [...current.items, ...page.items], cursor: page.nextCursor),
    );
  }
}

final myApprovalSubmissionsProvider =
    AsyncNotifierProvider.autoDispose<MyApprovalSubmissionsNotifier, MyApprovalSubmissionsPageState>(
      MyApprovalSubmissionsNotifier.new,
    );
