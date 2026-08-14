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

/// 採發比價表 — 一張對應報價單的一個大項，比較多家廠商報價（從廠商主檔
/// 選），決標後回填成控表對應列的「實際發包」，簽核通過後鎖定。
class ProcurementTab extends ConsumerWidget {
  const ProcurementTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(procurementComparisonsProvider(projectId));
    final quotationAsync = ref.watch(engineeringQuotationProvider(projectId));
    final itemsById = <String, QuotationItemNode>{
      for (final (_, node) in quotationAsync.value?.flattened ?? const <(int, QuotationItemNode)>[]) node.id: node,
    };
    final topLevelItems = quotationAsync.value?.tree ?? const <QuotationItemNode>[];

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createComparison(context, ref, topLevelItems),
        icon: const Icon(Icons.add),
        label: const Text('新增比價表'),
      ),
      body: listAsync.when(
        data: (comparisons) {
          if (comparisons.isEmpty) return const Center(child: Text('還沒有任何採發比價表，按右下角新增'));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              for (final c in comparisons)
                _ComparisonCard(projectId: projectId, comparison: c, itemName: itemsById[c.quotationLineItemId]?.name ?? c.quotationLineItemId),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取採發比價表失敗：$error')),
      ),
    );
  }

  Future<void> _createComparison(BuildContext context, WidgetRef ref, List<QuotationItemNode> topLevelItems) async {
    if (topLevelItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('報價單還沒有任何大項，請先到工程報價單新增')));
      return;
    }
    String? quotationLineItemId;
    ProcurementInspectionMethod inspectionMethod = ProcurementInspectionMethod.monthly;
    ProcurementPaymentMethod paymentMethod = ProcurementPaymentMethod.monthly5050;
    final inspectionOtherController = TextEditingController();
    final paymentOtherController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增採發比價表'),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: quotationLineItemId,
                    decoration: const InputDecoration(labelText: '對應報價單大項'),
                    items: [for (final item in topLevelItems) DropdownMenuItem(value: item.id, child: Text(item.name))],
                    onChanged: (v) => setState(() => quotationLineItemId = v),
                  ),
                  const SizedBox(height: 12),
                  const Text('估驗方式', style: TextStyle(fontWeight: FontWeight.w600)),
                  for (final m in ProcurementInspectionMethod.values)
                    RadioListTile<ProcurementInspectionMethod>(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: m,
                      groupValue: inspectionMethod,
                      onChanged: (v) => setState(() => inspectionMethod = v!),
                      title: Text(m.label),
                    ),
                  if (inspectionMethod == ProcurementInspectionMethod.other)
                    TextField(
                      controller: inspectionOtherController,
                      decoration: const InputDecoration(labelText: '請說明估驗方式'),
                    ),
                  const SizedBox(height: 8),
                  const Text('付款方式', style: TextStyle(fontWeight: FontWeight.w600)),
                  for (final m in ProcurementPaymentMethod.values)
                    RadioListTile<ProcurementPaymentMethod>(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: m,
                      groupValue: paymentMethod,
                      onChanged: (v) => setState(() => paymentMethod = v!),
                      title: Text(m.label),
                    ),
                  if (paymentMethod == ProcurementPaymentMethod.other)
                    TextField(controller: paymentOtherController, decoration: const InputDecoration(labelText: '請說明付款方式')),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: quotationLineItemId == null ? null : () => Navigator.of(context).pop(true), child: const Text('新增')),
          ],
        ),
      ),
    );
    if (confirmed != true || quotationLineItemId == null || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).createProcurementComparison(
        projectId: projectId,
        quotationLineItemId: quotationLineItemId!,
        inspectionMethod: inspectionMethod,
        inspectionOtherNote: inspectionOtherController.text.trim(),
        paymentMethod: paymentMethod,
        paymentOtherNote: paymentOtherController.text.trim(),
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _ComparisonCard extends ConsumerWidget {
  const _ComparisonCard({required this.projectId, required this.comparison, required this.itemName});

  final String projectId;
  final ProcurementComparison comparison;
  final String itemName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (comparison.locked) const LockedBanner(),
            Row(
              children: [
                Expanded(child: Text(itemName, style: Theme.of(context).textTheme.titleMedium)),
                if (comparison.finalAwardedAmount != null) Chip(label: Text('決標 ${formatAmount(comparison.finalAwardedAmount!)}')),
                if (!comparison.locked)
                  IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete(context, ref)),
              ],
            ),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                Text('估驗方式：${comparison.inspectionMethod.label}${comparison.inspectionOtherNote != null ? '（${comparison.inspectionOtherNote}）' : ''}'),
                Text('付款方式：${comparison.paymentMethod.label}${comparison.paymentOtherNote != null ? '（${comparison.paymentOtherNote}）' : ''}'),
                if (comparison.ownerQuoteAmount != null) Text('業主報價 ${formatAmount(comparison.ownerQuoteAmount!)}'),
                if (comparison.procurementBudget != null) Text('發包預算 ${formatAmount(comparison.procurementBudget!)}'),
                if (comparison.marginRate != null) Text('毛利率 ${(comparison.marginRate! * 100).toStringAsFixed(1)}%'),
              ],
            ),
            const SizedBox(height: 8),
            for (final quote in comparison.vendorQuotes)
              _VendorQuoteRow(projectId: projectId, comparison: comparison, quote: quote),
            if (!comparison.locked) ...[
              const SizedBox(height: 4),
              OutlinedButton.icon(
                onPressed: () => _addVendorQuote(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('新增廠商報價'),
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                if (!comparison.locked && comparison.finalAwardedAmount != null)
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

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除比價表'),
        content: Text('確定要刪除「$itemName」的比價表嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteProcurementComparison(projectId, comparison.id);
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _addVendorQuote(BuildContext context, WidgetRef ref) async {
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;
    final vendors = await ref.read(vendorsProvider(project.spaceId).future);
    if (!context.mounted) return;
    if (vendors.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('這個公司空間還沒有任何廠商，請先到廠商管理新增')));
      return;
    }

    String? vendorId;
    final quotedController = TextEditingController();
    final negotiatedController = TextEditingController();
    final noteController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增廠商報價'),
          content: SizedBox(
            width: 320,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: vendorId,
                  decoration: const InputDecoration(labelText: '廠商'),
                  items: [for (final v in vendors) DropdownMenuItem(value: v.id, child: Text(v.name))],
                  onChanged: (v) => setState(() => vendorId = v),
                ),
                TextField(
                  controller: quotedController,
                  decoration: const InputDecoration(labelText: '報價（未稅）'),
                  keyboardType: TextInputType.number,
                ),
                TextField(
                  controller: negotiatedController,
                  decoration: const InputDecoration(labelText: '議價（未稅，選填）'),
                  keyboardType: TextInputType.number,
                ),
                TextField(controller: noteController, decoration: const InputDecoration(labelText: '備註（選填）')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: vendorId == null ? null : () => Navigator.of(context).pop(true), child: const Text('新增')),
          ],
        ),
      ),
    );
    if (confirmed != true || vendorId == null || !context.mounted) return;

    final quotedAmount = double.tryParse(quotedController.text.trim());
    if (quotedAmount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入正確的報價金額')));
      return;
    }

    try {
      await ref.read(apiClientProvider).addVendorQuote(
        projectId: projectId,
        comparisonId: comparison.id,
        vendorId: vendorId!,
        quotedAmount: quotedAmount,
        negotiatedAmount: double.tryParse(negotiatedController.text.trim()),
        note: noteController.text.trim(),
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
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
        title: '採發比價表送簽',
        roleLabels: kProcurementComparisonRoles,
        spaceId: project.spaceId,
      ),
    );
    if (approverIds == null || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).submitProcurementComparison(
        projectId: projectId,
        comparisonId: comparison.id,
        approverUserIds: approverIds,
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已送出簽核')));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _showHistory(BuildContext context, WidgetRef ref) async {
    final approvals = await ref
        .read(apiClientProvider)
        .procurementComparisonApprovals(projectId: projectId, comparisonId: comparison.id);
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('採發比價表簽核歷程'),
        content: SizedBox(width: 420, height: 400, child: ApprovalHistoryList(approvals: approvals)),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
      ),
    );
  }
}

class _VendorQuoteRow extends ConsumerWidget {
  const _VendorQuoteRow({required this.projectId, required this.comparison, required this.quote});

  final String projectId;
  final ProcurementComparison comparison;
  final VendorQuote quote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isSelected = comparison.selectedVendorQuoteId == quote.id;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: isSelected ? Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.4) : null,
        border: Border.all(color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          if (isSelected) const Padding(padding: EdgeInsets.only(right: 6), child: Icon(Icons.check_circle, size: 18)),
          Expanded(child: Text(quote.vendor.name)),
          Text('報價 ${formatAmount(quote.quotedAmount)}'),
          if (quote.negotiatedAmount != null) Text('　議價 ${formatAmount(quote.negotiatedAmount!)}'),
          const SizedBox(width: 12),
          if (!comparison.locked)
            IconButton(
              tooltip: quote.attachmentUrl != null ? '查看附件' : '上傳附件',
              icon: Icon(quote.attachmentUrl != null ? Icons.attachment : Icons.upload_file_outlined, size: 18),
              onPressed: () =>
                  quote.attachmentUrl != null ? launchUrl(Uri.parse(quote.attachmentUrl!)) : _uploadAttachment(context, ref),
            ),
          if (!comparison.locked && !isSelected)
            TextButton(onPressed: () => _select(context, ref), child: const Text('選定得標')),
          if (!comparison.locked)
            IconButton(icon: const Icon(Icons.delete_outline, size: 18), onPressed: isSelected ? null : () => _deleteQuote(context, ref)),
        ],
      ),
    );
  }

  Future<void> _select(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: (quote.negotiatedAmount ?? quote.quotedAmount).toStringAsFixed(0));
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('選定「${quote.vendor.name}」得標'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: '決標金額'),
          keyboardType: TextInputType.number,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('決標')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).selectVendorQuote(
        projectId: projectId,
        comparisonId: comparison.id,
        vendorQuoteId: quote.id,
        finalAwardedAmount: double.tryParse(controller.text.trim()),
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _deleteQuote(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).deleteVendorQuote(
        projectId: projectId,
        comparisonId: comparison.id,
        vendorQuoteId: quote.id,
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _uploadAttachment(BuildContext context, WidgetRef ref) async {
    final file = await openFile();
    if (file == null) return;
    final bytes = await file.readAsBytes();
    try {
      await ref.read(apiClientProvider).uploadVendorQuoteAttachment(
        projectId: projectId,
        comparisonId: comparison.id,
        vendorQuoteId: quote.id,
        fileName: file.name,
        bytes: bytes,
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
