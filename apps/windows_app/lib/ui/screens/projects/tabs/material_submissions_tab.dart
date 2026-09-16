import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/material_submission.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/engineering_finance_provider.dart';
import '../../../../state/material_submissions_provider.dart';
import '../../../../state/project_editor_provider.dart';

/// 材料送審（2026-09）— 單一送審人→單一審核結果的輕量流程，不是
/// DocumentApproval 那套多關卡簽核鏈。PENDING 的項目有「核准/駁回」按
/// 鈕，實際能不能按由後端 assertCanWrite（PROJECT/WRITE 權限）把關，這
/// 裡不做額外的角色判斷。
class MaterialSubmissionsTab extends ConsumerWidget {
  const MaterialSubmissionsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final submissionsAsync = ref.watch(materialSubmissionsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _create(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增送審'),
      ),
      body: submissionsAsync.when(
        data: (submissions) {
          if (submissions.isEmpty) return const Center(child: Text('這個專案還沒有任何材料送審，按右下角新增'));
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: submissions.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final s = submissions[index];
              return ListTile(
                leading: _StatusChip(status: s.status),
                title: Text(s.materialName),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (s.spec != null && s.spec!.isNotEmpty) Text('規格：${s.spec}'),
                    if (s.vendorName != null) Text('廠商：${s.vendorName}'),
                    Text('送審日期：${s.submittedDate.year}/${s.submittedDate.month}/${s.submittedDate.day}'),
                    if (s.reviewComment != null && s.reviewComment!.isNotEmpty) Text('審核備註：${s.reviewComment}'),
                    Text(
                      '送審人：${s.submittedByName}${s.reviewedByName != null ? '　審核人：${s.reviewedByName}' : ''}',
                      style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
                isThreeLine: true,
                trailing: s.status == MaterialSubmissionStatus.pending
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.check_circle_outline, color: Colors.green),
                            tooltip: '核准',
                            onPressed: () => _review(context, ref, s, MaterialSubmissionStatus.approved),
                          ),
                          IconButton(
                            icon: const Icon(Icons.cancel_outlined, color: Colors.red),
                            tooltip: '駁回',
                            onPressed: () => _review(context, ref, s, MaterialSubmissionStatus.rejected),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline),
                            tooltip: '刪除',
                            onPressed: () => _delete(context, ref, s),
                          ),
                        ],
                      )
                    : null,
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取材料送審失敗：$error')),
      ),
    );
  }

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;
    final vendors = await ref.read(vendorsProvider(project.spaceId).future);
    if (!context.mounted) return;

    final materialNameController = TextEditingController();
    final specController = TextEditingController();
    String? vendorId;
    DateTime submittedDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增材料送審'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(controller: materialNameController, decoration: const InputDecoration(labelText: '材料名稱')),
                  TextField(controller: specController, decoration: const InputDecoration(labelText: '規格說明（選填）')),
                  DropdownButtonFormField<String?>(
                    initialValue: vendorId,
                    decoration: const InputDecoration(labelText: '廠商（選填）'),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('未指定')),
                      for (final v in vendors) DropdownMenuItem<String?>(value: v.id, child: Text(v.name)),
                    ],
                    onChanged: (value) => setState(() => vendorId = value),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: Text('送審日期：${submittedDate.year}/${submittedDate.month}/${submittedDate.day}')),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: submittedDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => submittedDate = picked);
                        },
                        child: const Text('選擇日期'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('送出')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final materialName = materialNameController.text.trim();
    if (materialName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請填寫材料名稱')));
      return;
    }

    try {
      await ref
          .read(apiClientProvider)
          .createMaterialSubmission(
            projectId: projectId,
            materialName: materialName,
            spec: specController.text.trim(),
            vendorId: vendorId,
            submittedDate: submittedDate,
          );
      ref.invalidate(materialSubmissionsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _review(
    BuildContext context,
    WidgetRef ref,
    MaterialSubmission submission,
    MaterialSubmissionStatus status,
  ) async {
    final commentController = TextEditingController();
    final isReject = status == MaterialSubmissionStatus.rejected;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(isReject ? '駁回材料送審' : '核准材料送審'),
        content: SizedBox(
          width: 320,
          child: TextField(
            controller: commentController,
            decoration: InputDecoration(labelText: isReject ? '駁回原因（必填）' : '審核備註（選填）'),
            maxLines: 3,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(isReject ? '駁回' : '核准')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final comment = commentController.text.trim();
    if (isReject && comment.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('駁回時請填寫原因')));
      return;
    }

    try {
      await ref
          .read(apiClientProvider)
          .reviewMaterialSubmission(
            projectId: projectId,
            submissionId: submission.id,
            status: status,
            reviewComment: comment,
          );
      ref.invalidate(materialSubmissionsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, MaterialSubmission submission) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除送審'),
        content: Text('確定要刪除「${submission.materialName}」的送審紀錄嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteMaterialSubmission(projectId: projectId, submissionId: submission.id);
      ref.invalidate(materialSubmissionsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final MaterialSubmissionStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      MaterialSubmissionStatus.pending => Colors.orange,
      MaterialSubmissionStatus.approved => Colors.green,
      MaterialSubmissionStatus.rejected => Colors.red,
    };
    return Chip(
      label: Text(status.label, style: const TextStyle(fontSize: 11, color: Colors.white)),
      backgroundColor: color,
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
    );
  }
}
