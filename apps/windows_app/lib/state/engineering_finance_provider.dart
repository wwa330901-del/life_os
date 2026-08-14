import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/document_approval.dart';
import '../core/models/engineering_finance.dart';
import 'auth_provider.dart';

final vendorsProvider = FutureProvider.autoDispose.family<List<Vendor>, String>((ref, spaceId) {
  return ref.read(apiClientProvider).vendors(spaceId);
});

typedef VendorHistoryQuery = ({String spaceId, String vendorId});

final vendorHistoryProvider = FutureProvider.autoDispose.family<List<VendorHistoryEntry>, VendorHistoryQuery>((
  ref,
  query,
) {
  return ref.read(apiClientProvider).vendorHistory(query.spaceId, query.vendorId);
});

final engineeringQuotationProvider = FutureProvider.autoDispose.family<EngineeringQuotationTree, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).engineeringQuotation(projectId);
});

final costControlInitialSheetProvider = FutureProvider.autoDispose.family<CostControlInitialSheet, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).costControlInitialSheet(projectId);
});

final costControlInitialSheetApprovalsProvider =
    FutureProvider.autoDispose.family<List<DocumentApprovalSummary>, String>((ref, projectId) {
      return ref.read(apiClientProvider).costControlInitialSheetApprovals(projectId);
    });

final costControlRowsProvider = FutureProvider.autoDispose.family<List<CostControlRow>, String>((ref, projectId) {
  return ref.read(apiClientProvider).costControlRows(projectId);
});

final procurementComparisonsProvider =
    FutureProvider.autoDispose.family<List<ProcurementComparison>, String>((ref, projectId) {
      return ref.read(apiClientProvider).procurementComparisons(projectId);
    });

typedef ProcurementComparisonApprovalsQuery = ({String projectId, String comparisonId});

final procurementComparisonApprovalsProvider = FutureProvider.autoDispose
    .family<List<DocumentApprovalSummary>, ProcurementComparisonApprovalsQuery>((ref, query) {
      return ref
          .read(apiClientProvider)
          .procurementComparisonApprovals(projectId: query.projectId, comparisonId: query.comparisonId);
    });

final paymentRequestPeriodsProvider = FutureProvider.autoDispose.family<List<PaymentRequestPeriod>, String>((
  ref,
  projectId,
) {
  return ref.read(apiClientProvider).paymentRequestPeriods(projectId);
});

typedef PaymentRequestPeriodApprovalsQuery = ({String projectId, String periodId});

final paymentRequestPeriodApprovalsProvider = FutureProvider.autoDispose
    .family<List<DocumentApprovalSummary>, PaymentRequestPeriodApprovalsQuery>((ref, query) {
      return ref
          .read(apiClientProvider)
          .paymentRequestPeriodApprovals(projectId: query.projectId, periodId: query.periodId);
    });
