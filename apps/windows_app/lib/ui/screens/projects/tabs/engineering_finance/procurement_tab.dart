import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 採發比價表 — 一個專案可以有多張（每張對應一個發包範圍），每張底下比較
/// 多家廠商報價，選定得標廠商後帶出決標金額，成控表的列可以連結一張比價表
/// 帶入實際發包金額。
class ProcurementTab extends ConsumerWidget {
  const ProcurementTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(procurementComparisonsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createComparison(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增比價表'),
      ),
      body: listAsync.when(
        data: (comparisons) {
          if (comparisons.isEmpty) {
            return const Center(child: Text('還沒有任何採發比價表，按右下角新增'));
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [for (final c in comparisons) _ComparisonCard(projectId: projectId, comparison: c)],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取採發比價表失敗：$error')),
      ),
    );
  }

  Future<void> _createComparison(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增採發比價表'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: '比價範圍名稱')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('新增')),
        ],
      ),
    );
    if (confirmed != true || controller.text.trim().isEmpty) return;

    try {
      await ref.read(apiClientProvider).createProcurementComparison(projectId, controller.text.trim());
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _ComparisonCard extends ConsumerWidget {
  const _ComparisonCard({required this.projectId, required this.comparison});

  final String projectId;
  final ProcurementComparison comparison;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                  child: Text(comparison.scopeName, style: Theme.of(context).textTheme.titleMedium),
                ),
                if (comparison.finalAwardedAmount != null)
                  Chip(label: Text('決標 ${formatAmount(comparison.finalAwardedAmount!)}')),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _delete(context, ref),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final quote in comparison.vendorQuotes) _VendorQuoteRow(projectId: projectId, comparison: comparison, quote: quote),
            const SizedBox(height: 4),
            OutlinedButton.icon(
              onPressed: () => _addVendorQuote(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('新增廠商報價'),
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
        content: Text('確定要刪除「${comparison.scopeName}」嗎？'),
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
    final nameController = TextEditingController();
    final amountController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增廠商報價'),
        content: SizedBox(
          width: 320,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: '廠商名稱')),
              TextField(
                controller: amountController,
                decoration: const InputDecoration(labelText: '報價金額'),
                keyboardType: TextInputType.number,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('新增')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final vendorName = nameController.text.trim();
    final amount = double.tryParse(amountController.text.trim());
    if (vendorName.isEmpty || amount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請確認欄位都有正確填寫')));
      return;
    }

    try {
      await ref.read(apiClientProvider).addVendorQuote(
        projectId: projectId,
        comparisonId: comparison.id,
        vendorName: vendorName,
        quotedAmount: amount,
      );
      ref.invalidate(procurementComparisonsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
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
          Expanded(child: Text(quote.vendorName)),
          Text(formatAmount(quote.quotedAmount)),
          const SizedBox(width: 12),
          IconButton(
            tooltip: quote.attachmentUrl != null ? '查看附件' : '上傳附件',
            icon: Icon(quote.attachmentUrl != null ? Icons.attachment : Icons.upload_file_outlined, size: 18),
            onPressed: () => quote.attachmentUrl != null
                ? launchUrl(Uri.parse(quote.attachmentUrl!))
                : _uploadAttachment(context, ref),
          ),
          if (!isSelected)
            TextButton(onPressed: () => _select(context, ref), child: const Text('選定得標')),
          IconButton(
            icon: const Icon(Icons.delete_outline, size: 18),
            onPressed: isSelected ? null : () => _deleteQuote(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _select(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).selectVendorQuote(
        projectId: projectId,
        comparisonId: comparison.id,
        vendorQuoteId: quote.id,
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
