import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/client.dart';
import 'auth_provider.dart';

/// 這個公司空間的客戶清單（CRM 客戶端那一半，Vendor 是協力商那一半）。
final clientsProvider = FutureProvider.autoDispose.family<List<Client>, String>((ref, spaceId) {
  return ref.read(apiClientProvider).clients(spaceId);
});
