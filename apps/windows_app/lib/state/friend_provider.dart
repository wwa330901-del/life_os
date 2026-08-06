import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/models/friend.dart';
import 'auth_provider.dart';

final friendsProvider = FutureProvider.autoDispose<List<FriendUser>>((ref) {
  return ref.read(apiClientProvider).listFriends();
});

final friendInvitesReceivedProvider = FutureProvider.autoDispose<List<FriendInvite>>((ref) {
  return ref.read(apiClientProvider).listReceivedFriendInvites();
});

final friendInvitesSentProvider = FutureProvider.autoDispose<List<FriendInvite>>((ref) {
  return ref.read(apiClientProvider).listSentFriendInvites();
});
