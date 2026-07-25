import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project_member.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_members_provider.dart';

/// Lets the user pick which space members to add to a project. Structurally
/// the same search+checkbox pattern as `DependencyPickerDialog`, but unlike
/// that dialog (which just returns a list for the caller to store locally),
/// every checked member here is a real API write — there's no "cancel"
/// after confirm partway through, so failures are surfaced per member
/// instead of all-or-nothing.
class MemberPickerDialog extends ConsumerStatefulWidget {
  const MemberPickerDialog({
    super.key,
    required this.projectId,
    required this.spaceId,
    required this.existingMemberIds,
  });

  final String projectId;
  final String spaceId;
  final Set<String> existingMemberIds;

  static Future<bool> show(
    BuildContext context, {
    required String projectId,
    required String spaceId,
    required Set<String> existingMemberIds,
  }) async {
    final added = await showDialog<bool>(
      context: context,
      builder: (_) => MemberPickerDialog(
        projectId: projectId,
        spaceId: spaceId,
        existingMemberIds: existingMemberIds,
      ),
    );
    return added ?? false;
  }

  @override
  ConsumerState<MemberPickerDialog> createState() => _MemberPickerDialogState();
}

class _MemberPickerDialogState extends ConsumerState<MemberPickerDialog> {
  final Set<String> _selected = {};
  String _searchText = '';
  bool _submitting = false;

  Future<void> _confirm(List<SpaceMember> candidates) async {
    setState(() => _submitting = true);
    final api = ref.read(apiClientProvider);
    var anyAdded = false;
    for (final userId in _selected) {
      try {
        await api.addProjectMember(projectId: widget.projectId, userId: userId, role: ProjectRole.member);
        anyAdded = true;
      } on ApiException catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
        }
      }
    }
    if (anyAdded) {
      ref.invalidate(projectMembersProvider(widget.projectId));
    }
    if (mounted) Navigator.of(context).pop(anyAdded);
  }

  @override
  Widget build(BuildContext context) {
    final membersAsync = ref.watch(spaceMembersProvider(widget.spaceId));

    return AlertDialog(
      title: const Text('新增專案成員'),
      content: SizedBox(
        width: 360,
        child: membersAsync.when(
          data: (spaceMembers) {
            final candidates = spaceMembers
                .where((m) => !widget.existingMemberIds.contains(m.userId))
                .toList();
            final query = _searchText.trim().toLowerCase();
            final filtered = query.isEmpty
                ? candidates
                : candidates
                      .where((m) => m.name.toLowerCase().contains(query) || m.email.toLowerCase().contains(query))
                      .toList();

            if (candidates.isEmpty) {
              return const Text('這個空間的成員都已經加進這個專案了');
            }
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  autofocus: true,
                  decoration: const InputDecoration(
                    hintText: '搜尋姓名或 email…',
                    prefixIcon: Icon(Icons.search, size: 20),
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) => setState(() => _searchText = value),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 320,
                  child: filtered.isEmpty
                      ? const Center(child: Text('找不到符合的成員'))
                      : ListView(
                          shrinkWrap: true,
                          children: [
                            for (final candidate in filtered)
                              CheckboxListTile(
                                dense: true,
                                value: _selected.contains(candidate.userId),
                                title: Text(candidate.name),
                                subtitle: Text(candidate.email),
                                onChanged: (checked) {
                                  setState(() {
                                    if (checked == true) {
                                      _selected.add(candidate.userId);
                                    } else {
                                      _selected.remove(candidate.userId);
                                    }
                                  });
                                },
                              ),
                          ],
                        ),
                ),
              ],
            );
          },
          loading: () => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator())),
          error: (error, _) => Text('讀取空間成員失敗：$error'),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _submitting || _selected.isEmpty
              ? null
              : () => _confirm(membersAsync.value ?? const []),
          child: _submitting
              ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('新增'),
        ),
      ],
    );
  }
}
