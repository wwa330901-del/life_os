import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../core/models/project_member.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../../../state/project_editor_provider.dart';
import '../../../../../state/project_members_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 工程請款單 — 廠商向我們請款，對應一列成控管制表列，固定五關依序簽核
/// （業務主管→財務初審→成控→總經理→會計出納），承辦人送出時指定各關負責人。
class PaymentRequestsTab extends ConsumerWidget {
  const PaymentRequestsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(paymentRequestsProvider(projectId));
    final currentUserId = ref.watch(authControllerProvider).value?.user.id;

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _create(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增請款單'),
      ),
      body: listAsync.when(
        data: (requests) {
          if (requests.isEmpty) {
            return const Center(child: Text('還沒有任何請款單，按右下角新增'));
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              for (final request in requests)
                _PaymentRequestCard(projectId: projectId, request: request, currentUserId: currentUserId),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取請款單失敗：$error')),
      ),
    );
  }

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final rows = ref.read(costControlRowsProvider(projectId)).value ?? const <CostControlRow>[];
    if (rows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('要先在成控管制表建立至少一列，才能送出請款單')));
      return;
    }
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;

    final result = await showDialog<bool>(
      context: context,
      builder: (_) => _CreatePaymentRequestDialog(projectId: projectId, spaceId: project.spaceId, rows: rows),
    );
    if (result == true) {
      ref.invalidate(paymentRequestsProvider(projectId));
    }
  }
}

class _PaymentRequestCard extends ConsumerWidget {
  const _PaymentRequestCard({required this.projectId, required this.request, required this.currentUserId});

  final String projectId;
  final PaymentRequest request;
  final String? currentUserId;

  Color _statusColor(BuildContext context, String status) {
    final scheme = Theme.of(context).colorScheme;
    return switch (status) {
      'APPROVED' => Colors.green,
      'REJECTED' => scheme.error,
      _ => scheme.outline,
    };
  }

  String _statusLabel(String status) => switch (status) {
    'APPROVED' => '核准',
    'REJECTED' => '退回',
    _ => '待簽核',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membersAsync = ref.watch(
      projectEditorProvider(projectId).select((v) => v.value?.project.spaceId),
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('${request.vendorName}　${formatAmount(request.amount)}', style: Theme.of(context).textTheme.titleMedium),
                ),
                Chip(
                  label: Text(_statusLabel(request.overallStatus)),
                  backgroundColor: _statusColor(context, request.overallStatus).withValues(alpha: 0.15),
                  labelStyle: TextStyle(color: _statusColor(context, request.overallStatus)),
                ),
              ],
            ),
            Text(
              '請款日期 ${request.requestDate.year}/${request.requestDate.month}/${request.requestDate.day}　'
              '合約金額快照 ${formatAmount(request.contractAmountSnapshot)}　'
              '送出前已請款 ${(request.billedPercentBefore * 100).toStringAsFixed(1)}%',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (request.note != null && request.note!.isNotEmpty) Text(request.note!),
            const Divider(height: 24),
            if (membersAsync != null)
              _StageTimeline(spaceId: membersAsync, projectId: projectId, request: request, currentUserId: currentUserId),
          ],
        ),
      ),
    );
  }
}

class _StageTimeline extends ConsumerWidget {
  const _StageTimeline({
    required this.spaceId,
    required this.projectId,
    required this.request,
    required this.currentUserId,
  });

  final String spaceId;
  final String projectId;
  final PaymentRequest request;
  final String? currentUserId;

  bool _isCurrentStage(PaymentRequestStageKey stage) {
    final index = kPaymentRequestStageOrder.indexOf(stage);
    for (var i = 0; i < index; i++) {
      if (request.stages[kPaymentRequestStageOrder[i]]!.status != 'APPROVED') return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membersAsync = ref.watch(spaceMembersProvider(spaceId));
    final memberById = {for (final m in membersAsync.value ?? const <SpaceMember>[]) m.userId: m};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final stage in kPaymentRequestStageOrder)
          Builder(
            builder: (context) {
              final state = request.stages[stage]!;
              final isMine = request.overallStatus == 'PENDING' &&
                  state.status == 'PENDING' &&
                  state.userId == currentUserId &&
                  _isCurrentStage(stage);
              final icon = switch (state.status) {
                'APPROVED' => const Icon(Icons.check_circle, color: Colors.green, size: 18),
                'REJECTED' => Icon(Icons.cancel, color: Theme.of(context).colorScheme.error, size: 18),
                _ => const Icon(Icons.radio_button_unchecked, size: 18),
              };
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    icon,
                    const SizedBox(width: 8),
                    Text('${stage.label}：${memberById[state.userId]?.name ?? state.userId}'),
                    if (state.comment != null && state.comment!.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Expanded(child: Text('（${state.comment}）', style: Theme.of(context).textTheme.bodySmall)),
                    ],
                    if (isMine) ...[
                      const Spacer(),
                      TextButton(onPressed: () => _decide(context, ref, stage, true), child: const Text('核准')),
                      TextButton(onPressed: () => _decide(context, ref, stage, false), child: const Text('退回')),
                    ],
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  Future<void> _decide(BuildContext context, WidgetRef ref, PaymentRequestStageKey stage, bool approve) async {
    String? comment;
    if (!approve) {
      final controller = TextEditingController();
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('退回請款單'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(labelText: '退回原因（必填）'),
            autofocus: true,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('退回')),
          ],
        ),
      );
      if (confirmed != true || controller.text.trim().isEmpty) return;
      comment = controller.text.trim();
    }

    try {
      await ref.read(apiClientProvider).decidePaymentRequestStage(
        paymentRequestId: request.id,
        stage: stage,
        approve: approve,
        comment: comment,
      );
      ref.invalidate(paymentRequestsProvider(projectId));
      ref.invalidate(pendingPaymentRequestApprovalsProvider);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _CreatePaymentRequestDialog extends ConsumerStatefulWidget {
  const _CreatePaymentRequestDialog({required this.projectId, required this.spaceId, required this.rows});

  final String projectId;
  final String spaceId;
  final List<CostControlRow> rows;

  @override
  ConsumerState<_CreatePaymentRequestDialog> createState() => _CreatePaymentRequestDialogState();
}

class _CreatePaymentRequestDialogState extends ConsumerState<_CreatePaymentRequestDialog> {
  late String _rowId = widget.rows.first.id;
  final _vendorNameController = TextEditingController();
  final _amountController = TextEditingController();
  final _noteController = TextEditingController();
  DateTime _requestDate = DateTime.now();

  final Map<PaymentRequestStageKey, String?> _approvers = {
    for (final stage in kPaymentRequestStageOrder) stage: null,
  };

  @override
  Widget build(BuildContext context) {
    final membersAsync = ref.watch(spaceMembersProvider(widget.spaceId));
    final members = membersAsync.value ?? const <SpaceMember>[];

    return AlertDialog(
      title: const Text('新增請款單'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _rowId,
                decoration: const InputDecoration(labelText: '對應成控列（發包）'),
                items: [for (final row in widget.rows) DropdownMenuItem(value: row.id, child: Text(row.name))],
                onChanged: (v) => setState(() => _rowId = v!),
              ),
              TextField(controller: _vendorNameController, decoration: const InputDecoration(labelText: '廠商名稱')),
              TextField(
                controller: _amountController,
                decoration: const InputDecoration(labelText: '本次請款金額'),
                keyboardType: TextInputType.number,
              ),
              Row(
                children: [
                  Expanded(child: Text('請款日期：${_requestDate.year}/${_requestDate.month}/${_requestDate.day}')),
                  TextButton(onPressed: _pickDate, child: const Text('選擇日期')),
                ],
              ),
              TextField(controller: _noteController, decoration: const InputDecoration(labelText: '備註（選填）')),
              const Divider(height: 24),
              const Text('各關簽核人', style: TextStyle(fontWeight: FontWeight.w600)),
              for (final stage in kPaymentRequestStageOrder)
                DropdownButtonFormField<String>(
                  initialValue: _approvers[stage],
                  decoration: InputDecoration(labelText: stage.label),
                  items: [for (final m in members) DropdownMenuItem(value: m.userId, child: Text(m.name))],
                  onChanged: (v) => setState(() => _approvers[stage] = v),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('送出')),
      ],
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _requestDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _requestDate = picked);
  }

  Future<void> _submit() async {
    final vendorName = _vendorNameController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (vendorName.isEmpty || amount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請確認廠商名稱跟金額都有正確填寫')));
      return;
    }
    if (_approvers.values.any((v) => v == null)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('五關簽核人都要指定')));
      return;
    }

    try {
      await ref.read(apiClientProvider).createPaymentRequest(
        projectId: widget.projectId,
        costControlRowId: _rowId,
        vendorName: vendorName,
        amount: amount,
        requestDate: _requestDate,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
        salesManagerUserId: _approvers[PaymentRequestStageKey.salesManager]!,
        financeReviewUserId: _approvers[PaymentRequestStageKey.financeReview]!,
        costControlApproverUserId: _approvers[PaymentRequestStageKey.costControlApprover]!,
        generalManagerUserId: _approvers[PaymentRequestStageKey.generalManager]!,
        accountingUserId: _approvers[PaymentRequestStageKey.accounting]!,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
