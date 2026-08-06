import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 成控管制表 — 每一列對應一個實際發包，可以勾選多筆報價單工項分組（實際
/// 發包不一定 1:1 對應報價分項），連結一張採發比價表帶入實際發包金額，
/// 追加/追減記錄異動歷程，累計已請款從核准的請款單加總。
class CostControlTab extends ConsumerWidget {
  const CostControlTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rowsAsync = ref.watch(costControlRowsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createRow(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增成控列'),
      ),
      body: rowsAsync.when(
        data: (rows) {
          if (rows.isEmpty) {
            return const Center(child: Text('還沒有任何成控列，按右下角新增'));
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [for (final row in rows) _CostControlRowCard(projectId: projectId, row: row)],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取成控管制表失敗：$error')),
      ),
    );
  }

  Future<void> _createRow(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增成控列'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: '這一列的名稱（例如「AB 發包」）')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('新增')),
        ],
      ),
    );
    if (confirmed != true || controller.text.trim().isEmpty) return;

    try {
      await ref.read(apiClientProvider).createCostControlRow(projectId: projectId, name: controller.text.trim());
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _CostControlRowCard extends ConsumerWidget {
  const _CostControlRowCard({required this.projectId, required this.row});

  final String projectId;
  final CostControlRow row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comparisonsAsync = ref.watch(procurementComparisonsProvider(projectId));
    final linkedComparison = comparisonsAsync.value?.where((c) => c.id == row.procurementComparisonId).firstOrNull;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(row.name, style: Theme.of(context).textTheme.titleMedium)),
                IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete(context, ref)),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                Text('業主報價 ${formatAmount(row.quoteRevenueTotal)}'),
                Text('預估成本 ${formatAmount(row.estimatedCostTotal)}'),
                Text('實際發包 ${row.awardedAmount != null ? formatAmount(row.awardedAmount!) : '未決標'}'),
                Text('追加減 ${formatAmount(row.adjustmentsTotal)}'),
                Text('合約金額 ${formatAmount(row.contractAmount)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                Text('已請款 ${formatAmount(row.billedTotal)}（${(row.billedPercent * 100).toStringAsFixed(1)}%）'),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('連結比價表：', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(width: 4),
                Text(linkedComparison?.scopeName ?? '未連結'),
                TextButton(onPressed: () => _linkComparison(context, ref, comparisonsAsync.value ?? const []), child: const Text('變更')),
              ],
            ),
            const Divider(height: 24),
            Text('勾選工項（${row.quotationItems.length} 項）', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final item in row.quotationItems) Chip(label: Text(item.name))],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: () => _pickQuotationItems(context, ref),
                  icon: const Icon(Icons.checklist_outlined),
                  label: const Text('選擇工項'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _showBreakdown(context, ref),
                  icon: const Icon(Icons.list_alt_outlined),
                  label: const Text('拆項表'),
                ),
              ],
            ),
            const Divider(height: 24),
            Text('追加/追減', style: Theme.of(context).textTheme.bodyMedium),
            for (final adjustment in row.adjustments)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  adjustment.type == 'ADD' ? Icons.add_circle_outline : Icons.remove_circle_outline,
                  color: adjustment.type == 'ADD' ? Colors.green : Colors.red,
                  size: 18,
                ),
                title: Text('${formatAmount(adjustment.amount)}${adjustment.note != null ? '　${adjustment.note}' : ''}'),
                trailing: IconButton(
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () => _deleteAdjustment(context, ref, adjustment),
                ),
              ),
            OutlinedButton.icon(
              onPressed: () => _addAdjustment(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('新增追加/追減'),
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
        title: const Text('刪除成控列'),
        content: Text('確定要刪除「${row.name}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ref.read(apiClientProvider).deleteCostControlRow(projectId, row.id);
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _linkComparison(BuildContext context, WidgetRef ref, List<ProcurementComparison> comparisons) async {
    final selected = await showDialog<String?>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('連結採發比價表'),
        children: [
          SimpleDialogOption(onPressed: () => Navigator.of(context).pop(null), child: const Text('（不連結）')),
          for (final c in comparisons)
            SimpleDialogOption(onPressed: () => Navigator.of(context).pop(c.id), child: Text(c.scopeName)),
        ],
      ),
    );
    if (!context.mounted) return;

    try {
      await ref.read(apiClientProvider).updateCostControlRow(
        projectId: projectId,
        rowId: row.id,
        procurementComparisonId: selected,
        clearProcurementComparison: selected == null,
      );
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _pickQuotationItems(BuildContext context, WidgetRef ref) async {
    final quotationAsync = ref.read(quotationItemsProvider(projectId));
    final allItems = quotationAsync.value?.items ?? const <QuotationItem>[];
    final otherRows = (ref.read(costControlRowsProvider(projectId)).value ?? const <CostControlRow>[])
        .where((r) => r.id != row.id);
    final takenElsewhere = {for (final r in otherRows) for (final item in r.quotationItems) item.id};

    final selectedIds = {for (final item in row.quotationItems) item.id};
    final result = await showDialog<Set<String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('選擇工項'),
          content: SizedBox(
            width: 420,
            height: 400,
            child: ListView(
              children: [
                for (final item in allItems)
                  CheckboxListTile(
                    value: selectedIds.contains(item.id),
                    onChanged: takenElsewhere.contains(item.id)
                        ? null
                        : (checked) => setState(() {
                            if (checked == true) {
                              selectedIds.add(item.id);
                            } else {
                              selectedIds.remove(item.id);
                            }
                          }),
                    title: Text(item.name),
                    subtitle: Text(
                      takenElsewhere.contains(item.id)
                          ? '已被別的成控列勾選'
                          : '複價 ${formatAmount(item.complexPrice)}',
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(selectedIds), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).setCostControlRowItems(
        projectId: projectId,
        rowId: row.id,
        quotationLineItemIds: result.toList(),
      );
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _showBreakdown(BuildContext context, WidgetRef ref) async {
    try {
      final breakdown = await ref.read(apiClientProvider).costControlBreakdown(projectId, row.id);
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('拆項表：${breakdown.rowName}'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('工項')),
                  DataColumn(label: Text('複價'), numeric: true),
                  DataColumn(label: Text('成本複價'), numeric: true),
                ],
                rows: [
                  for (final item in breakdown.items)
                    DataRow(cells: [
                      DataCell(Text(item.name)),
                      DataCell(Text(formatAmount(item.complexPrice))),
                      DataCell(Text(formatAmount(item.costComplexPrice))),
                    ]),
                  DataRow(cells: [
                    const DataCell(Text('合計', style: TextStyle(fontWeight: FontWeight.w600))),
                    DataCell(Text(formatAmount(breakdown.totalComplexPrice), style: const TextStyle(fontWeight: FontWeight.w600))),
                    DataCell(Text(formatAmount(breakdown.totalCostComplexPrice), style: const TextStyle(fontWeight: FontWeight.w600))),
                  ]),
                ],
              ),
            ),
          ),
          actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
        ),
      );
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _addAdjustment(BuildContext context, WidgetRef ref) async {
    String type = 'ADD';
    final amountController = TextEditingController();
    final noteController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增追加/追減'),
          content: SizedBox(
            width: 320,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'ADD', label: Text('追加')),
                    ButtonSegment(value: 'DEDUCT', label: Text('追減')),
                  ],
                  selected: {type},
                  onSelectionChanged: (s) => setState(() => type = s.first),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountController,
                  decoration: const InputDecoration(labelText: '金額'),
                  keyboardType: TextInputType.number,
                ),
                TextField(controller: noteController, decoration: const InputDecoration(labelText: '備註（選填）')),
              ],
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

    final amount = double.tryParse(amountController.text.trim());
    if (amount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入正確的金額')));
      return;
    }

    try {
      await ref.read(apiClientProvider).addCostControlAdjustment(
        projectId: projectId,
        rowId: row.id,
        type: type,
        amount: amount,
        note: noteController.text.trim().isEmpty ? null : noteController.text.trim(),
      );
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _deleteAdjustment(BuildContext context, WidgetRef ref, CostControlAdjustment adjustment) async {
    try {
      await ref.read(apiClientProvider).deleteCostControlAdjustment(
        projectId: projectId,
        rowId: row.id,
        adjustmentId: adjustment.id,
      );
      ref.invalidate(costControlRowsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
