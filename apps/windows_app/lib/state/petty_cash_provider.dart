import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/petty_cash.dart';
import 'auth_provider.dart';

/// 這個公司空間的零用金帳（存入/支出/目前餘額）。
final pettyCashProvider = FutureProvider.autoDispose.family<PettyCashLedger, String>((ref, spaceId) {
  return ref.read(apiClientProvider).pettyCash(spaceId);
});
