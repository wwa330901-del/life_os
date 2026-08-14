import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/document_approval.dart';
import '../../../../state/approvals_provider.dart';
import '../../../../state/auth_provider.dart';

/// 我送出的 — every approval the caller has submitted (cross-project), with
/// full step detail so they can see "目前卡在誰那裡" and reply to any
/// 提問 note left by the currently-active approver.
class MyApprovalSubmissionsTab extends ConsumerStatefulWidget {
  const MyApprovalSubmissionsTab({super.key});

  @override
  ConsumerState<MyApprovalSubmissionsTab> createState() => _MyApprovalSubmissionsTabState();
}

class _MyApprovalSubmissionsTabState extends ConsumerState<MyApprovalSubmissionsTab> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels < _scrollController.position.maxScrollExtent - 200) return;
    ref.read(myApprovalSubmissionsProvider.notifier).loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final pageAsync = ref.watch(myApprovalSubmissionsProvider);

    return pageAsync.when(
      data: (page) {
        if (page.items.isEmpty) {
          return const Center(child: Text('你還沒有送出過任何簽核'));
        }
        return ListView.separated(
          controller: _scrollController,
          padding: const EdgeInsets.all(16),
          itemCount: page.items.length + (page.hasMore ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            if (index >= page.items.length) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            return _SubmissionCard(approval: page.items[index]);
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取我送出的簽核失敗：$error')),
    );
  }
}

class _SubmissionCard extends StatelessWidget {
  const _SubmissionCard({required this.approval});

  final DocumentApprovalSummary approval;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(approval.targetDisplayName, style: Theme.of(context).textTheme.titleMedium)),
                _StatusBadge(status: approval.status),
              ],
            ),
            const SizedBox(height: 8),
            for (final step in approval.steps) _StepRow(step: step),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

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

class _StepRow extends ConsumerStatefulWidget {
  const _StepRow({required this.step});

  final DocumentApprovalStepDetail step;

  @override
  ConsumerState<_StepRow> createState() => _StepRowState();
}

class _StepRowState extends ConsumerState<_StepRow> {
  final _replyController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _replyController.dispose();
    super.dispose();
  }

  /// The latest note being a 提問 (rather than the submitter's own 回覆, or
  /// there being no note at all) is what "the approver is waiting on you"
  /// means — the step itself never records this, only the note ordering does.
  bool get _needsReply =>
      widget.step.status == DocumentApprovalStatus.pending &&
      widget.step.notes.isNotEmpty &&
      widget.step.notes.last.type == DocumentApprovalStepNoteType.requestInfo;

  Future<void> _reply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).replyDocumentApprovalStepNote(stepId: widget.step.id, text: text);
      ref.invalidate(myApprovalSubmissionsProvider);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final step = widget.step;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${step.sequence}. ${step.roleLabel != null ? '${step.roleLabel} ' : ''}'
            '${step.approverName} · ${step.status.label}',
          ),
          if (step.decisionComment != null && step.decisionComment!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Text('說明：${step.decisionComment}', style: const TextStyle(fontSize: 12)),
            ),
          for (final note in step.notes)
            Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Text(
                '${note.type == DocumentApprovalStepNoteType.requestInfo ? '❓ 提問' : '💬 回覆'}：${note.text}',
                style: const TextStyle(fontSize: 12),
              ),
            ),
          if (_needsReply) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _replyController,
                    decoration: const InputDecoration(labelText: '回覆說明', isDense: true),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: _submitting ? null : _reply, child: const Text('回覆')),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
