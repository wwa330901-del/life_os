import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/my_workspace.dart';
import 'auth_provider.dart';

/// 這個公司空間裡「我」的個人工作站彙總——自己是 PM 的專案、自己的工作
/// 代辦、自己待審核的材料送審。
final myWorkspaceProvider = FutureProvider.autoDispose.family<MyWorkspace, String>((ref, spaceId) {
  return ref.read(apiClientProvider).myWorkspace(spaceId);
});
