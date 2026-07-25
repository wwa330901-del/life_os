import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project_member.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_members_provider.dart';
import '../../../../state/space_provider.dart';
import '../../../widgets/projects/members/member_picker_dialog.dart';

/// 專案成員 tab: who can see/edit this project. Add/remove/re-role is
/// gated server-side to a project PM or the space's own OWNER/ADMIN (see
/// `ProjectMembersService.assertCanManage` on the API) — this tab mirrors
/// that same check client-side just to decide what controls to show, the
/// API is the actual enforcement.
class MembersTab extends ConsumerWidget {
  const MembersTab({super.key, required this.projectId});

  final String projectId;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(projectMembersProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membersAsync = ref.watch(projectMembersProvider(projectId));
    final space = ref.watch(selectedSpaceProvider);
    final session = ref.watch(authControllerProvider).value;
    final scheme = Theme.of(context).colorScheme;

    return membersAsync.when(
      data: (members) {
        final isSpaceManager = space?.role == 'OWNER' || space?.role == 'ADMIN';
        final myMembership = members.where((m) => m.userId == session?.user.id).firstOrNull;
        final canManage = isSpaceManager || myMembership?.role == ProjectRole.pm;

        return Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Text('專案成員', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  if (canManage)
                    FilledButton.icon(
                      onPressed: () async {
                        final space = ref.read(selectedSpaceProvider);
                        if (space == null) return;
                        final added = await MemberPickerDialog.show(
                          context,
                          projectId: projectId,
                          spaceId: space.id,
                          existingMemberIds: members.map((m) => m.userId).toSet(),
                        );
                        if (added) ref.invalidate(projectMembersProvider(projectId));
                      },
                      icon: const Icon(Icons.person_add_alt, size: 18),
                      label: const Text('新增成員'),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: ListView.separated(
                  itemCount: members.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final member = members[index];
                    return Card(
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: scheme.primary.withValues(alpha: 0.15),
                          child: Text(
                            member.name.isEmpty ? '?' : member.name.characters.first,
                            style: TextStyle(color: scheme.primary),
                          ),
                        ),
                        title: Text(member.name),
                        subtitle: Text(member.email),
                        trailing: canManage
                            ? PopupMenuButton<String>(
                                onSelected: (action) {
                                  if (action == 'make_pm') {
                                    _run(
                                      context,
                                      ref,
                                      () => ref
                                          .read(apiClientProvider)
                                          .updateProjectMemberRole(
                                            projectId: projectId,
                                            userId: member.userId,
                                            role: ProjectRole.pm,
                                          ),
                                    );
                                  } else if (action == 'make_member') {
                                    _run(
                                      context,
                                      ref,
                                      () => ref
                                          .read(apiClientProvider)
                                          .updateProjectMemberRole(
                                            projectId: projectId,
                                            userId: member.userId,
                                            role: ProjectRole.member,
                                          ),
                                    );
                                  } else if (action == 'remove') {
                                    _run(
                                      context,
                                      ref,
                                      () => ref
                                          .read(apiClientProvider)
                                          .removeProjectMember(projectId: projectId, userId: member.userId),
                                    );
                                  }
                                },
                                itemBuilder: (context) => [
                                  if (member.role != ProjectRole.pm)
                                    const PopupMenuItem(value: 'make_pm', child: Text('設為負責人 (PM)')),
                                  if (member.role == ProjectRole.pm)
                                    const PopupMenuItem(value: 'make_member', child: Text('設為一般成員')),
                                  const PopupMenuItem(value: 'remove', child: Text('移除成員')),
                                ],
                                child: _RoleBadge(role: member.role),
                              )
                            : _RoleBadge(role: member.role),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取專案成員失敗：$error')),
    );
  }
}

class _RoleBadge extends StatelessWidget {
  const _RoleBadge({required this.role});

  final ProjectRole role;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isPm = role == ProjectRole.pm;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: (isPm ? scheme.primary : scheme.onSurface).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        isPm ? 'PM' : '成員',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: isPm ? scheme.primary : scheme.onSurface.withValues(alpha: 0.7),
        ),
      ),
    );
  }
}
