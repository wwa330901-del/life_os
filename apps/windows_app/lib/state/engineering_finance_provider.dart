import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/engineering_finance.dart';
import 'auth_provider.dart';

final quotationItemsProvider = FutureProvider.autoDispose.family<QuotationList, String>((ref, projectId) {
  return ref.read(apiClientProvider).quotationItems(projectId);
});

final procurementComparisonsProvider =
    FutureProvider.autoDispose.family<List<ProcurementComparison>, String>((ref, projectId) {
      return ref.read(apiClientProvider).procurementComparisons(projectId);
    });

final costControlRowsProvider = FutureProvider.autoDispose.family<List<CostControlRow>, String>((ref, projectId) {
  return ref.read(apiClientProvider).costControlRows(projectId);
});

final paymentRequestsProvider = FutureProvider.autoDispose.family<List<PaymentRequest>, String>((ref, projectId) {
  return ref.read(apiClientProvider).paymentRequests(projectId);
});

final pendingPaymentRequestApprovalsProvider =
    FutureProvider.autoDispose<List<PendingPaymentRequestApproval>>((ref) {
      return ref.read(apiClientProvider).pendingPaymentRequestApprovals();
    });
