import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/document_approval.dart';
import '../../../../state/approvals_provider.dart';
import '../../../../state/auth_provider.dart';

/// 待我簽核 — every step (cross-project) currently awaiting the caller's own
/// action, already filtered server-side to "it's actually your turn" (an
/// earlier unresolved step in the same chain never shows up here).
class PendingApprovalsTab extends ConsumerWidget {
  const PendingApprovalsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pendingAsync = ref.watch(pendingApprovalsProvider);

    return pendingAsync.when(
      data: (items) {
        if (items.isEmpty) {
          return const Center(child: Text('目前沒有待你簽核的文件'));
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            final item = items[index];
            return Card(
              child: ListTile(
                leading: const Icon(Icons.fact_check_outlined),
                title: Text(item.documentName),
                subtitle: Text('第 ${item.sequence}/${item.totalSteps} 關 · 提交者：${item.submittedByName}'),
                onTap: () => _openActionDialog(context, ref, item),
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取待簽核清單失敗：$error')),
    );
  }

  Future<void> _openActionDialog(BuildContext context, WidgetRef ref, PendingApprovalStep item) async {
    await showDialog(context: context, builder: (_) => _PendingApprovalActionDialog(item: item));
    ref.invalidate(pendingApprovalsProvider);
  }
}

/// 核准／退回／提問 — one text field serves all three: optional on 核准,
/// required on 退回 and 提問 (enforced here and again server-side).
class _PendingApprovalActionDialog extends ConsumerStatefulWidget {
  const _PendingApprovalActionDialog({required this.item});

  final PendingApprovalStep item;

  @override
  ConsumerState<_PendingApprovalActionDialog> createState() => _PendingApprovalActionDialogState();
}

class _PendingApprovalActionDialogState extends ConsumerState<_PendingApprovalActionDialog> {
  final _commentController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _submitting = true);
    try {
      await action();
      if (mounted) Navigator.of(context).pop();
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
    final hasComment = _commentController.text.trim().isNotEmpty;
    return AlertDialog(
      title: Text(widget.item.documentName),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('第 ${widget.item.sequence}/${widget.item.totalSteps} 關 · 提交者：${widget.item.submittedByName}'),
            const SizedBox(height: 12),
            TextField(
              controller: _commentController,
              maxLines: 3,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: '說明／原因（核准選填，退回或提問必填）'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('關閉'),
        ),
        TextButton(
          onPressed: _submitting || !hasComment
              ? null
              : () => _run(
                  () => ref
                      .read(apiClientProvider)
                      .requestDocumentApprovalStepInfo(
                        stepId: widget.item.stepId,
                        text: _commentController.text.trim(),
                      ),
                ),
          child: const Text('提問'),
        ),
        FilledButton.tonal(
          onPressed: _submitting || !hasComment
              ? null
              : () => _run(
                  () => ref
                      .read(apiClientProvider)
                      .rejectDocumentApprovalStep(stepId: widget.item.stepId, comment: _commentController.text.trim()),
                ),
          child: const Text('退回'),
        ),
        FilledButton(
          onPressed: _submitting
              ? null
              : () => _run(
                  () => ref
                      .read(apiClientProvider)
                      .approveDocumentApprovalStep(
                        stepId: widget.item.stepId,
                        comment: hasComment ? _commentController.text.trim() : null,
                      ),
                ),
          child: const Text('核准'),
        ),
      ],
    );
  }
}
