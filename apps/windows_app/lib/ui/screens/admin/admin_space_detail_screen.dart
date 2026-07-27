import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/admin_models.dart';
import '../../../state/admin_provider.dart';
import '../../../state/auth_provider.dart';

class AdminSpaceDetailScreen extends ConsumerWidget {
  const AdminSpaceDetailScreen({super.key, required this.spaceId, required this.spaceName});

  final String spaceId;
  final String spaceName;

  Future<void> _addMember(BuildContext context, WidgetRef ref) async {
    final List<AdminUserSummary> users;
    try {
      users = await ref.read(adminUsersProvider.future);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return;
    }
    if (!context.mounted) return;

    // Best-effort — if the space detail hasn't loaded yet this is just
    // empty, so the picker shows everyone; the backend still rejects an
    // already-added account with a clear error either way.
    final existingUserIds = ref
        .read(adminSpaceDetailProvider(spaceId))
        .value
        ?.members
        .map((m) => m.userId)
        .toSet();
    final candidates = users.where((u) => existingUserIds?.contains(u.id) != true).toList();

    AdminUserSummary? selected;
    var role = MembershipRole.member;

    final result = await showDialog<(AdminUserSummary, MembershipRole)>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增成員'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Autocomplete<AdminUserSummary>(
                  displayStringForOption: (u) => '${u.name}（@${u.username}）',
                  optionsBuilder: (textEditingValue) {
                    final query = textEditingValue.text.trim().toLowerCase();
                    if (query.isEmpty) return candidates;
                    return candidates.where(
                      (u) =>
                          u.name.toLowerCase().contains(query) ||
                          u.username.toLowerCase().contains(query) ||
                          u.email.toLowerCase().contains(query),
                    );
                  },
                  onSelected: (u) => setState(() => selected = u),
                  fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) => TextField(
                    controller: controller,
                    focusNode: focusNode,
                    autofocus: true,
                    decoration: const InputDecoration(labelText: '帳號', hintText: '輸入姓名、帳號或 email 搜尋'),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<MembershipRole>(
                  initialValue: role,
                  decoration: const InputDecoration(labelText: '角色'),
                  items: MembershipRole.values
                      .map((r) => DropdownMenuItem(value: r, child: Text(r.label)))
                      .toList(),
                  onChanged: (value) => setState(() => role = value ?? role),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
            FilledButton(
              onPressed: selected == null
                  ? null
                  : () => Navigator.of(context).pop((selected!, role)),
              child: const Text('新增'),
            ),
          ],
        ),
      ),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .adminAddMember(spaceId: spaceId, username: result.$1.username, role: result.$2);
      ref.invalidate(adminSpaceDetailProvider(spaceId));
      ref.invalidate(adminSpacesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _changeRole(
    BuildContext context,
    WidgetRef ref,
    AdminSpaceMember member,
    MembershipRole role,
  ) async {
    if (role == member.role) return;
    try {
      await ref
          .read(apiClientProvider)
          .adminUpdateMemberRole(spaceId: spaceId, userId: member.userId, role: role);
      ref.invalidate(adminSpaceDetailProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _removeMember(BuildContext context, WidgetRef ref, AdminSpaceMember member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('移除成員'),
        content: Text('確定要將「${member.name}」移出這個空間嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('移除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).adminRemoveMember(spaceId: spaceId, userId: member.userId);
      ref.invalidate(adminSpaceDetailProvider(spaceId));
      ref.invalidate(adminSpacesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(adminSpaceDetailProvider(spaceId));

    return Scaffold(
      appBar: AppBar(title: Text(spaceName)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addMember(context, ref),
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('新增成員'),
      ),
      body: detailAsync.when(
        data: (detail) {
          if (detail.members.isEmpty) {
            return const Center(child: Text('這個空間目前沒有成員'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: detail.members.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final member = detail.members[index];
              return Card(
                child: ListTile(
                  title: Text('${member.name}（@${member.username}）'),
                  subtitle: Text(member.email),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      DropdownButton<MembershipRole>(
                        value: member.role,
                        underline: const SizedBox.shrink(),
                        items: MembershipRole.values
                            .map((r) => DropdownMenuItem(value: r, child: Text(r.label)))
                            .toList(),
                        onChanged: (role) {
                          if (role != null) _changeRole(context, ref, member, role);
                        },
                      ),
                      IconButton(
                        tooltip: '移除成員',
                        icon: const Icon(Icons.person_remove_outlined),
                        onPressed: () => _removeMember(context, ref, member),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取失敗：$error')),
      ),
    );
  }
}
