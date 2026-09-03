import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/department.dart';
import '../../../core/models/project_member.dart';
import '../../../state/auth_provider.dart';
import '../../../state/department_provider.dart';
import '../../../state/project_members_provider.dart';

/// 公司空間「部門與權限」設定畫面（2026-08-31 設計，見
/// project_life_os_company_space_target_scope 記憶）。OWNER-only（見
/// `AppSidebar` 的入口 gate，後端也各自用 `PermissionsService.assertOwner`
/// 再擋一次）。三個區塊：部門/職級、成員指派、權限規則——結構跟
/// `SpacePropertiesScreen` 同一套（一個 ListView 裡分段落，卡片+對話框，
/// 沒有另外做 notifier，直接呼叫 ApiClient 後 invalidate provider）。
class DepartmentPermissionsScreen extends ConsumerWidget {
  const DepartmentPermissionsScreen({super.key, required this.spaceId, required this.onBack});

  final String spaceId;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: onBack),
        title: const Text('部門與權限'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _DepartmentsSection(spaceId: spaceId),
          const SizedBox(height: 32),
          Divider(color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.25)),
          const SizedBox(height: 16),
          _MembersSection(spaceId: spaceId),
          const SizedBox(height: 32),
          Divider(color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.25)),
          const SizedBox(height: 16),
          _PermissionRulesSection(spaceId: spaceId),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 部門/職級
// ---------------------------------------------------------------------------

class _DepartmentsSection extends ConsumerWidget {
  const _DepartmentsSection({required this.spaceId});

  final String spaceId;

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(departmentsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<String?> _promptName(BuildContext context, String title, {String initial = ''}) {
    final controller = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('確定'),
          ),
        ],
      ),
    );
  }

  Future<bool> _confirm(BuildContext context, String title, String content) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(content),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    return confirmed == true;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final departmentsAsync = ref.watch(departmentsProvider(spaceId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('部門與職級', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          '每個部門自己定義自己的職級清單——不同部門的職級名稱可以完全不一樣',
          style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
        ),
        const SizedBox(height: 12),
        departmentsAsync.when(
          data: (departments) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (departments.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('這個空間還沒有任何部門'),
                )
              else
                for (final d in departments)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _DepartmentCard(
                      spaceId: spaceId,
                      department: d,
                      onRename: () async {
                        final name = await _promptName(context, '重新命名部門', initial: d.name);
                        if (name == null || name.isEmpty || !context.mounted) return;
                        await _run(
                          context,
                          ref,
                          () => ref.read(apiClientProvider).renameDepartment(spaceId, d.id, name),
                        );
                      },
                      onDelete: () async {
                        final ok = await _confirm(
                          context,
                          '刪除部門？',
                          '刪除「${d.name}」會一併刪除它底下的職級與相關權限規則，該部門的成員會變回「無部門/無職級」。',
                        );
                        if (!ok || !context.mounted) return;
                        await _run(context, ref, () => ref.read(apiClientProvider).deleteDepartment(spaceId, d.id));
                      },
                      onAddRank: () async {
                        final name = await _promptName(context, '新增職級');
                        if (name == null || name.isEmpty || !context.mounted) return;
                        await _run(
                          context,
                          ref,
                          () => ref.read(apiClientProvider).createDepartmentRank(spaceId, d.id, name),
                        );
                      },
                      onRenameRank: (rank) async {
                        final name = await _promptName(context, '重新命名職級', initial: rank.name);
                        if (name == null || name.isEmpty || !context.mounted) return;
                        await _run(
                          context,
                          ref,
                          () => ref.read(apiClientProvider).renameDepartmentRank(spaceId, d.id, rank.id, name),
                        );
                      },
                      onDeleteRank: (rank) async {
                        final ok = await _confirm(context, '刪除職級？', '刪除「${rank.name}」後，這個職級底下的成員會變回「無職級」。');
                        if (!ok || !context.mounted) return;
                        await _run(
                          context,
                          ref,
                          () => ref.read(apiClientProvider).deleteDepartmentRank(spaceId, d.id, rank.id),
                        );
                      },
                    ),
                  ),
              OutlinedButton.icon(
                onPressed: () async {
                  final name = await _promptName(context, '新增部門');
                  if (name == null || name.isEmpty || !context.mounted) return;
                  await _run(context, ref, () => ref.read(apiClientProvider).createDepartment(spaceId, name));
                },
                icon: const Icon(Icons.add, size: 18),
                label: const Text('新增部門'),
              ),
            ],
          ),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => Text('讀取部門失敗：$error'),
        ),
      ],
    );
  }
}

class _DepartmentCard extends StatelessWidget {
  const _DepartmentCard({
    required this.spaceId,
    required this.department,
    required this.onRename,
    required this.onDelete,
    required this.onAddRank,
    required this.onRenameRank,
    required this.onDeleteRank,
  });

  final String spaceId;
  final Department department;
  final VoidCallback onRename;
  final VoidCallback onDelete;
  final VoidCallback onAddRank;
  final void Function(DepartmentRank rank) onRenameRank;
  final void Function(DepartmentRank rank) onDeleteRank;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(department.name, style: Theme.of(context).textTheme.titleMedium)),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  tooltip: '重新命名',
                  onPressed: onRename,
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  tooltip: '刪除',
                  onPressed: onDelete,
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final rank in department.ranks)
                  InputChip(
                    label: Text(rank.name),
                    onPressed: () => onRenameRank(rank),
                    onDeleted: () => onDeleteRank(rank),
                  ),
                ActionChip(
                  avatar: const Icon(Icons.add, size: 16),
                  label: const Text('新增職級'),
                  onPressed: onAddRank,
                ),
              ],
            ),
            if (department.ranks.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '還沒有職級——沒有職級一樣可以指派成員到這個部門',
                  style: TextStyle(fontSize: 11, color: scheme.onSurface.withValues(alpha: 0.5)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 成員部門/職級指派
// ---------------------------------------------------------------------------

class _MembersSection extends ConsumerWidget {
  const _MembersSection({required this.spaceId});

  final String spaceId;

  Future<void> _assign(
    BuildContext context,
    WidgetRef ref, {
    required String userId,
    Object? departmentId = _memberUnset,
    Object? rankId = _memberUnset,
  }) async {
    try {
      await ref.read(apiClientProvider).assignMemberDepartment(
        spaceId: spaceId,
        userId: userId,
        departmentId: departmentId,
        rankId: rankId,
      );
      ref.invalidate(spaceMembersProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final membersAsync = ref.watch(spaceMembersProvider(spaceId));
    final departmentsAsync = ref.watch(departmentsProvider(spaceId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('成員的部門/職級', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          '還沒指派部門/職級的成員，只吃「不限部門且不限職級」這種通用規則',
          style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
        ),
        const SizedBox(height: 12),
        membersAsync.when(
          data: (members) => departmentsAsync.when(
            data: (departments) => Column(
              children: [
                for (final m in members)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _MemberRow(
                      member: m,
                      departments: departments,
                      onDepartmentChanged: (departmentId) => _assign(
                        context,
                        ref,
                        userId: m.userId,
                        departmentId: departmentId,
                        rankId: null,
                      ),
                      onRankChanged: (rankId) => _assign(context, ref, userId: m.userId, rankId: rankId),
                    ),
                  ),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Text('讀取部門失敗：$error'),
          ),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => Text('讀取成員失敗：$error'),
        ),
      ],
    );
  }
}

const Object _memberUnset = Object();

class _MemberRow extends StatelessWidget {
  const _MemberRow({
    required this.member,
    required this.departments,
    required this.onDepartmentChanged,
    required this.onRankChanged,
  });

  final SpaceMember member;
  final List<Department> departments;
  final void Function(String? departmentId) onDepartmentChanged;
  final void Function(String? rankId) onRankChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final currentDepartment = departments.where((d) => d.id == member.departmentId).firstOrNull;
    final ranks = currentDepartment?.ranks ?? const <DepartmentRank>[];
    // 目前的 rankId 若已經不屬於目前選到的部門（例如部門剛換過），下拉選單
    // 找不到對應項目——用 null（不限職級）當保險值，避免 DropdownButton
    // 因為 value 對不上任何 item 而丟例外。
    final rankValue = ranks.any((r) => r.id == member.rankId) ? member.rankId : null;

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(member.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(
                    member.email,
                    style: TextStyle(fontSize: 11, color: scheme.onSurface.withValues(alpha: 0.6)),
                  ),
                ],
              ),
            ),
            Expanded(
              child: DropdownButtonFormField<String?>(
                initialValue: member.departmentId,
                decoration: const InputDecoration(labelText: '部門', isDense: true),
                items: [
                  const DropdownMenuItem(value: null, child: Text('無部門')),
                  for (final d in departments) DropdownMenuItem(value: d.id, child: Text(d.name)),
                ],
                onChanged: onDepartmentChanged,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: DropdownButtonFormField<String?>(
                initialValue: rankValue,
                decoration: const InputDecoration(labelText: '職級', isDense: true),
                items: [
                  const DropdownMenuItem(value: null, child: Text('無職級')),
                  for (final r in ranks) DropdownMenuItem(value: r.id, child: Text(r.name)),
                ],
                onChanged: ranks.isEmpty ? null : onRankChanged,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// 權限規則
// ---------------------------------------------------------------------------

class _PermissionRulesSection extends ConsumerWidget {
  const _PermissionRulesSection({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final rulesAsync = ref.watch(permissionRulesProvider(spaceId));
    final departmentsAsync = ref.watch(departmentsProvider(spaceId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('權限規則', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          '「讀」不受這裡影響、永遠開放。寫入/核准/匯出這三種動作，找不到符合的規則就一律不能做——包含你自己還沒建任何規則的時候，除了空間 OWNER 自己永遠不受限。',
          style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
        ),
        const SizedBox(height: 12),
        rulesAsync.when(
          data: (rules) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (rules.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('目前沒有任何規則——所有非 OWNER 成員都還不能寫入/核准/匯出下面任何模組'),
                )
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final rule in rules)
                      InputChip(
                        label: Text(
                          '${permissionResourceTypeLabel(rule.resourceType)} · ${permissionActionLabel(rule.action)}'
                          ' · ${rule.departmentName ?? '不限部門'} / ${rule.rankName ?? '不限職級'}',
                        ),
                        onDeleted: () async {
                          try {
                            await ref.read(apiClientProvider).deletePermissionRule(spaceId, rule.id);
                            ref.invalidate(permissionRulesProvider(spaceId));
                          } on ApiException catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                            }
                          }
                        },
                      ),
                  ],
                ),
              const SizedBox(height: 12),
              departmentsAsync.when(
                data: (departments) => OutlinedButton.icon(
                  onPressed: () async {
                    final created = await showDialog<bool>(
                      context: context,
                      builder: (_) => _CreateRuleDialog(spaceId: spaceId, departments: departments),
                    );
                    if (created == true) {
                      ref.invalidate(permissionRulesProvider(spaceId));
                    }
                  },
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('新增規則'),
                ),
                loading: () => const SizedBox.shrink(),
                error: (error, _) => Text('讀取部門失敗：$error'),
              ),
            ],
          ),
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => Text('讀取規則失敗：$error'),
        ),
      ],
    );
  }
}

class _CreateRuleDialog extends StatefulWidget {
  const _CreateRuleDialog({required this.spaceId, required this.departments});

  final String spaceId;
  final List<Department> departments;

  @override
  State<_CreateRuleDialog> createState() => _CreateRuleDialogState();
}

class _CreateRuleDialogState extends State<_CreateRuleDialog> {
  PermissionResourceType _resourceType = PermissionResourceType.values.first;
  PermissionAction _action = PermissionAction.write;
  String? _departmentId;
  String? _rankId;
  bool _saving = false;

  List<DepartmentRank> get _ranks =>
      widget.departments.where((d) => d.id == _departmentId).firstOrNull?.ranks ?? const [];

  @override
  Widget build(BuildContext context) {
    return Consumer(
      builder: (context, ref, _) {
        return AlertDialog(
          title: const Text('新增規則'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<PermissionResourceType>(
                  initialValue: _resourceType,
                  decoration: const InputDecoration(labelText: '模組'),
                  items: [
                    for (final t in PermissionResourceType.values)
                      DropdownMenuItem(value: t, child: Text(permissionResourceTypeLabel(t))),
                  ],
                  onChanged: (value) => setState(() => _resourceType = value ?? _resourceType),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<PermissionAction>(
                  initialValue: _action,
                  decoration: const InputDecoration(labelText: '動作'),
                  items: [
                    for (final a in PermissionAction.values)
                      DropdownMenuItem(value: a, child: Text(permissionActionLabel(a))),
                  ],
                  onChanged: (value) => setState(() => _action = value ?? _action),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String?>(
                  initialValue: _departmentId,
                  decoration: const InputDecoration(labelText: '部門（留空＝不限）'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('不限部門')),
                    for (final d in widget.departments) DropdownMenuItem(value: d.id, child: Text(d.name)),
                  ],
                  onChanged: (value) => setState(() {
                    _departmentId = value;
                    _rankId = null;
                  }),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String?>(
                  initialValue: _rankId,
                  decoration: const InputDecoration(labelText: '職級（留空＝不限）'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('不限職級')),
                    for (final r in _ranks) DropdownMenuItem(value: r.id, child: Text(r.name)),
                  ],
                  onChanged: _departmentId == null ? null : (value) => setState(() => _rankId = value),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(
              onPressed: _saving
                  ? null
                  : () async {
                      setState(() => _saving = true);
                      try {
                        await ref.read(apiClientProvider).createPermissionRule(
                          spaceId: widget.spaceId,
                          resourceType: _resourceType,
                          action: _action,
                          departmentId: _departmentId,
                          rankId: _rankId,
                        );
                        if (context.mounted) Navigator.of(context).pop(true);
                      } on ApiException catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                        }
                        setState(() => _saving = false);
                      }
                    },
              child: _saving
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('新增'),
            ),
          ],
        );
      },
    );
  }
}
