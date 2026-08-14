import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../../../state/project_editor_provider.dart';
import '../../../finance/widgets/finance_format.dart';
import 'widgets/approval_widgets.dart';

/// 工程請款單 — 每一期是一筆 PaymentRequestPeriod，對應唯一一列③執行中
/// 成控表（一個發包）。廠商收款資訊建立時從決標廠商自動快照。期數自由
/// 新增；鎖定粒度是「這一期」，每期各自獨立走完六關簽核。
class PaymentRequestPeriodsTab extends ConsumerWidget {
  const PaymentRequestPeriodsTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(paymentRequestPeriodsProvider(projectId));
    final rowsAsync = ref.watch(costControlRowsProvider(projectId));
    final rowNameById = {for (final r in rowsAsync.value ?? const <CostControlRow>[]) r.id: r.name};

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _create(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增請款單期別'),
      ),
      body: listAsync.when(
        data: (periods) {
          if (periods.isEmpty) return const Center(child: Text('還沒有任何請款單，按右下角新增'));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              for (final period in periods)
                _PeriodCard(projectId: projectId, period: period, rowName: rowNameById[period.costControlRowId] ?? period.costControlRowId),
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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('要先在成控管制表建立至少一列並決標，才能送出請款單')));
      return;
    }

    String rowId = rows.first.id;
    final periodLabelController = TextEditingController();
    final amountController = TextEditingController();
    final noteController = TextEditingController();
    DateTime requestDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增請款單期別'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: rowId,
                    decoration: const InputDecoration(labelText: '對應成控列（發包，須已決標）'),
                    items: [for (final row in rows) DropdownMenuItem(value: row.id, child: Text(row.name))],
                    onChanged: (v) => setState(() => rowId = v!),
                  ),
                  TextField(
                    controller: periodLabelController,
                    decoration: const InputDecoration(labelText: '期別名稱（例如「第一期」「保留款」）'),
                  ),
                  TextField(
                    controller: amountController,
                    decoration: const InputDecoration(labelText: '本次請款金額'),
                    keyboardType: TextInputType.number,
                  ),
                  Row(
                    children: [
                      Expanded(child: Text('請款日期：${requestDate.year}/${requestDate.month}/${requestDate.day}')),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: requestDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => requestDate = picked);
                        },
                        child: const Text('選擇日期'),
                      ),
                    ],
                  ),
                  TextField(controller: noteController, decoration: const InputDecoration(labelText: '備註（選填）')),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('新增')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final periodLabel = periodLabelController.text.trim();
    final amount = double.tryParse(amountController.text.trim());
    if (periodLabel.isEmpty || amount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請確認期別名稱跟金額都有正確填寫')));
      return;
    }

    try {
      await ref.read(apiClientProvider).createPaymentRequestPeriod(
        projectId: projectId,
        costControlRowId: rowId,
        periodLabel: periodLabel,
        amount: amount,
        requestDate: requestDate,
        note: noteController.text.trim(),
      );
      ref.invalidate(paymentRequestPeriodsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _PeriodCard extends ConsumerWidget {
  const _PeriodCard({required this.projectId, required this.period, required this.rowName});

  final String projectId;
  final PaymentRequestPeriod period;
  final String rowName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (period.locked) const LockedBanner(text: '這一期已簽核通過並鎖定，只能匯出／列印'),
            Text('$rowName － ${period.periodLabel}', style: Theme.of(context).textTheme.titleMedium),
            Text(
              '${period.vendorNameSnapshot}　${formatAmount(period.amount)}　'
              '請款日期 ${period.requestDate.year}/${period.requestDate.month}/${period.requestDate.day}',
            ),
            Text(
              '合約金額快照 ${formatAmount(period.contractAmountSnapshot)}　'
              '送出前已請款 ${(period.billedPercentBefore * 100).toStringAsFixed(1)}%',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (period.note != null && period.note!.isNotEmpty) Text(period.note!),
            const Divider(height: 24),
            if (period.additionalAmount != null)
              Row(
                children: [
                  Expanded(child: Text('追加款 ${formatAmount(period.additionalAmount!)}')),
                  if (period.additionalQuotationAttachmentUrl != null)
                    TextButton.icon(
                      onPressed: () => launchUrl(Uri.parse(period.additionalQuotationAttachmentUrl!)),
                      icon: const Icon(Icons.attachment, size: 16),
                      label: const Text('追加報價單'),
                    ),
                ],
              )
            else if (!period.locked)
              OutlinedButton.icon(
                onPressed: () => _addAdditionalCharge(context, ref),
                icon: const Icon(Icons.add_card_outlined),
                label: const Text('新增追加款'),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                if (!period.locked)
                  FilledButton.icon(
                    onPressed: () => _submit(context, ref),
                    icon: const Icon(Icons.send_outlined),
                    label: const Text('送簽'),
                  ),
                TextButton.icon(
                  onPressed: () => _showHistory(context, ref),
                  icon: const Icon(Icons.history),
                  label: const Text('簽核歷程'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addAdditionalCharge(BuildContext context, WidgetRef ref) async {
    final amountController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增追加款'),
        content: SizedBox(
          width: 320,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: amountController,
                decoration: const InputDecoration(labelText: '追加款金額'),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 8),
              const Text('確認後會請您選擇一份「追加報價單」附件一起送出，兩者缺一不可。', style: TextStyle(fontSize: 12)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('下一步：選擇附件')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final amount = double.tryParse(amountController.text.trim());
    if (amount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入正確的金額')));
      return;
    }

    final file = await openFile();
    if (file == null) return;
    final bytes = await file.readAsBytes();

    try {
      await ref.read(apiClientProvider).addPaymentRequestPeriodAdditionalCharge(
        projectId: projectId,
        periodId: period.id,
        amount: amount,
        fileName: file.name,
        bytes: bytes,
      );
      ref.invalidate(paymentRequestPeriodsProvider(projectId));
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;
    final approverIds = await showDialog<List<String>>(
      context: context,
      builder: (_) => FixedRoleApprovalSubmitDialog(
        title: '請款單「${period.periodLabel}」送簽',
        roleLabels: kPaymentRequestPeriodRoles,
        spaceId: project.spaceId,
      ),
    );
    if (approverIds == null || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).submitPaymentRequestPeriod(
        projectId: projectId,
        periodId: period.id,
        approverUserIds: approverIds,
      );
      ref.invalidate(paymentRequestPeriodsProvider(projectId));
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已送出簽核')));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _showHistory(BuildContext context, WidgetRef ref) async {
    final approvals = await ref.read(apiClientProvider).paymentRequestPeriodApprovals(projectId: projectId, periodId: period.id);
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('請款單簽核歷程'),
        content: SizedBox(width: 420, height: 400, child: ApprovalHistoryList(approvals: approvals)),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
      ),
    );
  }
}
