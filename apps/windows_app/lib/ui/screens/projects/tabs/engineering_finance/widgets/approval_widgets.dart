import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../../core/models/document_approval.dart';
import '../../../../../../core/models/project_member.dart';
import '../../../../../../state/project_members_provider.dart';

/// 工程財務三張固定關卡表（①初始管制表／採發比價表／請款單期數）共用的送簽
/// 對話框——關卡數量/名稱固定（[roleLabels]），使用者只需要幫每一關指定人，
/// 不像 GeneratedDocument 那樣自由排序。回傳依序對應 [roleLabels] 的
/// approverUserIds，取消則回傳 null。
class FixedRoleApprovalSubmitDialog extends ConsumerStatefulWidget {
  const FixedRoleApprovalSubmitDialog({super.key, required this.title, required this.roleLabels, required this.spaceId});

  final String title;
  final List<String> roleLabels;
  final String spaceId;

  @override
  ConsumerState<FixedRoleApprovalSubmitDialog> createState() => _FixedRoleApprovalSubmitDialogState();
}

class _FixedRoleApprovalSubmitDialogState extends ConsumerState<FixedRoleApprovalSubmitDialog> {
  late final List<String?> _selected = List<String?>.filled(widget.roleLabels.length, null);

  @override
  Widget build(BuildContext context) {
    final membersAsync = ref.watch(spaceMembersProvider(widget.spaceId));
    final members = membersAsync.value ?? const <SpaceMember>[];
    final allChosen = _selected.every((id) => id != null);

    return AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 380,
        child: membersAsync.when(
          data: (_) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < widget.roleLabels.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    children: [
                      SizedBox(width: 80, child: Text('${i + 1}. ${widget.roleLabels[i]}')),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _selected[i],
                          isDense: true,
                          decoration: const InputDecoration(isDense: true, border: OutlineInputBorder()),
                          items: [
                            for (final m in members) DropdownMenuItem(value: m.userId, child: Text(m.name)),
                          ],
                          onChanged: (value) => setState(() => _selected[i] = value),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text('讀取成員失敗：$error'),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: allChosen ? () => Navigator.of(context).pop(List<String>.from(_selected)) : null,
          child: const Text('送出'),
        ),
      ],
    );
  }
}

/// 簽核歷程——列出每一次送簽的每一關狀態，工程財務三張表共用。
class ApprovalHistoryList extends StatelessWidget {
  const ApprovalHistoryList({super.key, required this.approvals});

  final List<DocumentApprovalSummary> approvals;

  @override
  Widget build(BuildContext context) {
    if (approvals.isEmpty) return const Center(child: Text('還沒有送過簽'));
    return ListView(
      shrinkWrap: true,
      children: [
        for (final a in approvals) ...[
          Row(
            children: [
              Expanded(child: Text(_formatDateTime(a.createdAt), style: Theme.of(context).textTheme.titleSmall)),
              _ApprovalStatusChip(status: a.status),
            ],
          ),
          const SizedBox(height: 6),
          for (final s in a.steps)
            Padding(
              padding: const EdgeInsets.only(left: 12, bottom: 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${s.sequence}. ${s.roleLabel != null ? '${s.roleLabel} ' : ''}${s.approverName} · ${s.status.label}'),
                  if (s.decisionComment != null && s.decisionComment!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 16),
                      child: Text('說明：${s.decisionComment}', style: const TextStyle(fontSize: 12)),
                    ),
                  for (final note in s.notes)
                    Padding(
                      padding: const EdgeInsets.only(left: 16),
                      child: Text(
                        '${note.type == DocumentApprovalStepNoteType.requestInfo ? '❓ 提問' : '💬 回覆'}：${note.text}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                ],
              ),
            ),
          const Divider(),
        ],
      ],
    );
  }
}

class _ApprovalStatusChip extends StatelessWidget {
  const _ApprovalStatusChip({required this.status});

  final DocumentApprovalStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = switch (status) {
      DocumentApprovalStatus.pending => scheme.secondary,
      DocumentApprovalStatus.approved => Colors.green,
      DocumentApprovalStatus.rejected => scheme.error,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
      child: Text(status.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

/// 已鎖定的提示條——三張需要簽核的表都用同一個樣式。
class LockedBanner extends StatelessWidget {
  const LockedBanner({super.key, this.text = '已簽核通過並鎖定，只能匯出／列印，不能再編輯'});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: scheme.primaryContainer, borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          Icon(Icons.lock_outline, size: 16, color: scheme.onPrimaryContainer),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: scheme.onPrimaryContainer, fontSize: 12))),
        ],
      ),
    );
  }
}

String _formatDateTime(DateTime dt) =>
    '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')} '
    '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
