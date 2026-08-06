import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/friend.dart';
import '../../../state/auth_provider.dart';
import '../../../state/friend_provider.dart';

/// 好友管理 (2026-08-06) — 共用行事曆/借出借入互通的邀請流程都要求對方先是
/// 好友（見後端 `Friendship` schema 註解），這裡是唯一的「加好友」入口。
class FriendsDialog extends StatelessWidget {
  const FriendsDialog({super.key});

  static Future<void> show(BuildContext context) {
    return showDialog<void>(context: context, builder: (_) => const FriendsDialog());
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: SizedBox(
        width: 480,
        height: 560,
        child: DefaultTabController(
          length: 2,
          child: Column(
            children: [
              const TabBar(
                tabs: [Tab(text: '好友'), Tab(text: '邀請')],
              ),
              const Expanded(
                child: TabBarView(
                  children: [_FriendsTab(), _InvitesTab()],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FriendsTab extends ConsumerWidget {
  const _FriendsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friendsAsync = ref.watch(friendsProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton.icon(
            onPressed: () => _invite(context, ref),
            icon: const Icon(Icons.person_add_alt_outlined, size: 18),
            label: const Text('用 email 邀請好友'),
          ),
        ),
        Expanded(
          child: friendsAsync.when(
            data: (friends) {
              if (friends.isEmpty) {
                return const Center(child: Text('還沒有任何好友'));
              }
              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: friends.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final friend = friends[index];
                  return Card(
                    child: ListTile(
                      title: Text(friend.name),
                      subtitle: Text(friend.email),
                      trailing: IconButton(
                        icon: const Icon(Icons.person_remove_outlined, size: 18),
                        tooltip: '移除好友',
                        onPressed: () => _remove(context, ref, friend),
                      ),
                    ),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('讀取失敗：$error')),
          ),
        ),
      ],
    );
  }

  Future<void> _invite(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final email = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('用 email 邀請好友'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'email'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('送出邀請'),
          ),
        ],
      ),
    );
    if (email == null || email.isEmpty || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).inviteFriend(email);
      ref.invalidate(friendInvitesSentProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _remove(BuildContext context, WidgetRef ref, FriendUser friend) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('移除好友'),
        content: Text('確定不要再跟「${friend.name}」當好友嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('移除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    if (friend.friendshipId == null) return;
    try {
      await ref.read(apiClientProvider).removeFriend(friend.friendshipId!);
      ref.invalidate(friendsProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _InvitesTab extends ConsumerWidget {
  const _InvitesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final receivedAsync = ref.watch(friendInvitesReceivedProvider);
    final sentAsync = ref.watch(friendInvitesSentProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('收到的邀請', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        receivedAsync.when(
          data: (invites) {
            if (invites.isEmpty) return const Text('目前沒有收到的邀請');
            return Column(
              children: [
                for (final invite in invites)
                  Card(
                    child: ListTile(
                      title: Text(invite.otherUser.name),
                      subtitle: Text(invite.otherUser.email),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(onPressed: () => _accept(context, ref, invite), child: const Text('接受')),
                          IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            tooltip: '拒絕',
                            onPressed: () => _remove(context, ref, invite, isReceived: true),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text('讀取失敗：$error'),
        ),
        const SizedBox(height: 20),
        Text('送出的邀請', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        sentAsync.when(
          data: (invites) {
            if (invites.isEmpty) return const Text('目前沒有送出的邀請');
            return Column(
              children: [
                for (final invite in invites)
                  Card(
                    child: ListTile(
                      title: Text(invite.otherUser.name),
                      subtitle: Text('${invite.otherUser.email} · 等待對方接受'),
                      trailing: IconButton(
                        icon: const Icon(Icons.close, size: 18),
                        tooltip: '撤銷',
                        onPressed: () => _remove(context, ref, invite, isReceived: false),
                      ),
                    ),
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text('讀取失敗：$error'),
        ),
      ],
    );
  }

  Future<void> _accept(BuildContext context, WidgetRef ref, FriendInvite invite) async {
    try {
      await ref.read(apiClientProvider).acceptFriendInvite(invite.id);
      ref.invalidate(friendInvitesReceivedProvider);
      ref.invalidate(friendsProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _remove(BuildContext context, WidgetRef ref, FriendInvite invite, {required bool isReceived}) async {
    try {
      await ref.read(apiClientProvider).removeFriend(invite.id);
      ref.invalidate(isReceived ? friendInvitesReceivedProvider : friendInvitesSentProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
