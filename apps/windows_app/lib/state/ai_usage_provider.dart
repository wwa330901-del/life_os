import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/ai_usage.dart';
import 'auth_provider.dart';

final aiUsageHistoryProvider = FutureProvider.autoDispose<AiUsageHistory>((ref) {
  return ref.read(apiClientProvider).getAiUsageHistory();
});

final hasGeminiApiKeyProvider = FutureProvider.autoDispose<bool>((ref) {
  return ref.read(apiClientProvider).hasGeminiApiKey();
});
