import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../../../state/project_editor_provider.dart';
import '../../../finance/widgets/finance_format.dart';
import 'widgets/approval_widgets.dart';

/// 成控管制表 — 初始管制表（要簽核、簽核通過鎖定）／拆項表（結構調整：
/// 分組/勾選工項/業主端追加減）／執行中成控表（同一份 CostControlRow，
/// 疊加實際發包/合約/請款進度等執行面欄位，兩者完全連動、不是各自維護）。
class CostControlTab extends StatelessWidget {
  const CostControlTab({super.key, required this.projectId});

  final String projectId;

  static const _subTabs = [Tab(text: '初始管制表'), Tab(text: '拆項表'), Tab(text: '執行中成控表')];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DefaultTabController(
      length: _subTabs.length,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.25)))),
            child: const TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: _subTabs),
          ),
          Expanded(
            child: TabBarView(
              children: [
                _InitialSheetView(projectId: projectId),
                _BreakdownRowsView(projectId: projectId),
                _ExecutionRowsView(projectId: projectId),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InitialSheetView extends ConsumerWidget {
  const _InitialSheetView({required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sheetAsync = ref.watch(costControlInitialSheetProvider(projectId));

    return sheetAsync.when(
      data: (sheet) {
        final ownerTotal = sheet.items.fold<double>(0, (sum, i) => sum + i.ownerQuoteAmount);
        final costTotal = sheet.items.fold<double>(0, (sum, i) => sum + i.estimatedCostAmount);
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (sheet.locked) const LockedBanner(),
              Row(
                children: [
                  Text('項目直接對齊報價單大項，業主報價＝B方案(議價後)金額總和，預估成本＝成本複價總和。', style: Theme.of(context).textTheme.bodySmall),
                  const Spacer(),
                  if (!sheet.locked)
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
              const SizedBox(height: 12),
              Expanded(
                child: sheet.items.isEmpty
                    ? const Center(child: Text('報價單還沒有任何大項'))
                    : SingleChildScrollView(
                        child: DataTable(
                          columns: const [
                            DataColumn(label: Text('大項')),
                            DataColumn(label: Text('業主報價'), numeric: true),
                            DataColumn(label: Text('預估成本'), numeric: true),
                            DataColumn(label: Text('毛利率'), numeric: true),
                          ],
                          rows: [
                            for (final item in sheet.items)
                              DataRow(
                                cells: [
                                  DataCell(Text(item.name)),
                                  DataCell(Text(formatAmount(item.ownerQuoteAmount))),
                                  DataCell(Text(formatAmount(item.estimatedCostAmount))),
                                  DataCell(Text('${(item.marginPercent * 100).toStringAsFixed(1)}%')),
                                ],
                              ),
                            DataRow(
                              cells: [
                                const DataCell(Text('合計', style: TextStyle(fontWeight: FontWeight.w700))),
                                DataCell(Text(formatAmount(ownerTotal), style: const TextStyle(fontWeight: FontWeight.w700))),
                                DataCell(Text(formatAmount(costTotal), style: const TextStyle(fontWeight: FontWeight.w700))),
                                const DataCell(Text('')),
                              ],
                            ),
                          ],
                        ),
                      ),
              ),
            ],
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取初始管制表失敗：$error')),
    );
  }

  Future<void> _submit(BuildContext context, WidgetRef ref) async {
    final project = ref.read(projectEditorProvider(projectId)).value?.project;
    if (project == null) return;
    final approverIds = await showDialog<List<String>>(
      context: context,
      builder: (_) => FixedRoleApprovalSubmitDialog(
        title: '初始管制表送簽',
        roleLabels: kCostControlInitialSheetRoles,
        spaceId: project.spaceId,
      ),
    );
    if (approverIds == null || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).submitCostControlInitialSheet(projectId: projectId, approverUserIds: approverIds);
      ref.invalidate(costControlInitialSheetProvider(projectId));
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已送出簽核')));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _showHistory(BuildContext context, WidgetRef ref) async {
    final approvals = await ref.read(apiClientProvider).costControlInitialSheetApprovals(projectId);
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('初始管制表簽核歷程'),
        content: SizedBox(width: 420, height: 400, child: ApprovalHistoryList(approvals: approvals)),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
      ),
    );
  }
}

/// 拆項表 — 結構面：新增/刪除成控列、把報價單工項分組進每一列、業主端
/// 追加/追減（跟原報價單比較後的業主端異動）。跟執行中成控表是同一份
/// `CostControlRow` 資料，這裡只是不顯示執行面欄位。
class _BreakdownRowsView extends ConsumerWidget {
  const _BreakdownRowsView({required this.projectId});

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
          if (rows.isEmpty) return const Center(child: Text('還沒有任何成控列，按右下角新增'));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [for (final row in rows) _BreakdownRowCard(projectId: projectId, row: row)],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取拆項表失敗：$error')),
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

class _BreakdownRowCard extends ConsumerWidget {
  const _BreakdownRowCard({required this.projectId, required this.row});

  final String projectId;
  final CostControlRow row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quotationAsync = ref.watch(engineeringQuotationProvider(projectId));
    final itemsById = <String, QuotationItemNode>{
      for (final (_, node) in quotationAsync.value?.flattened ?? const <(int, QuotationItemNode)>[]) node.id: node,
    };
    final ownerAdjustments = row.adjustments.where((a) => a.isOwner).toList();

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
                Text('業主追加減 ${formatAmount(row.ownerAdjustmentsTotal)}'),
              ],
            ),
            const Divider(height: 24),
            Text('勾選工項（${row.quotationLineItemIds.length} 項）', style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final id in row.quotationLineItemIds) Chip(label: Text(itemsById[id]?.name ?? id))],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: () => _pickQuotationItems(context, ref, itemsById),
                  icon: const Icon(Icons.checklist_outlined),
                  label: const Text('選擇工項'),
                ),
                OutlinedButton.icon(
                  onPressed: () => _showBreakdown(context, ref),
                  icon: const Icon(Icons.list_alt_outlined),
                  label: const Text('拆項表明細'),
                ),
              ],
            ),
            const Divider(height: 24),
            Text('業主端追加/追減', style: Theme.of(context).textTheme.bodyMedium),
            for (final adjustment in ownerAdjustments)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  adjustment.type == 'ADD' ? Icons.add_circle_outline : Icons.remove_circle_outline,
                  color: adjustment.type == 'ADD' ? Colors.green : Colors.red,
                  size: 18,
                ),
                title: Text(
                  '${formatAmount(adjustment.amount)}${adjustment.note != null ? '　${adjustment.note}' : ''}',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () => _deleteAdjustment(context, ref, adjustment),
                ),
              ),
            OutlinedButton.icon(
              onPressed: () => _addAdjustment(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('新增業主端追加/追減'),
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

  Future<void> _pickQuotationItems(BuildContext context, WidgetRef ref, Map<String, QuotationItemNode> itemsById) async {
    final allItems = itemsById.values.toList();
    final otherRows = (ref.read(costControlRowsProvider(projectId)).value ?? const <CostControlRow>[])
        .where((r) => r.id != row.id);
    final takenElsewhere = {for (final r in otherRows) ...r.quotationLineItemIds};

    final selectedIds = {...row.quotationLineItemIds};
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
                      takenElsewhere.contains(item.id) ? '已被別的成控列勾選' : '複價 ${formatAmount(item.complexPrice)}',
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
                    DataRow(
                      cells: [
                        DataCell(Text(item.name)),
                        DataCell(Text(formatAmount(item.complexPrice))),
                        DataCell(Text(formatAmount(item.costComplexPrice))),
                      ],
                    ),
                  DataRow(
                    cells: [
                      const DataCell(Text('合計', style: TextStyle(fontWeight: FontWeight.w600))),
                      DataCell(Text(formatAmount(breakdown.totalComplexPrice), style: const TextStyle(fontWeight: FontWeight.w600))),
                      DataCell(Text(formatAmount(breakdown.totalCostComplexPrice), style: const TextStyle(fontWeight: FontWeight.w600))),
                    ],
                  ),
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
          title: const Text('新增業主端追加/追減'),
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
      await ref.read(apiClientProvider).addCostControlOwnerAdjustment(
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

/// 執行中成控表 — 執行面：連結採發比價表、實際發包、業主/發包合約金額、
/// 已請款進度、發包端追加/追減（來自請款單，唯讀）。列的新增/刪除跟
/// 業主端追加/追減都在拆項表那頁做，這裡不重複提供。
class _ExecutionRowsView extends ConsumerWidget {
  const _ExecutionRowsView({required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rowsAsync = ref.watch(costControlRowsProvider(projectId));

    return rowsAsync.when(
      data: (rows) {
        if (rows.isEmpty) return const Center(child: Text('拆項表還沒有任何成控列'));
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [for (final row in rows) _ExecutionRowCard(projectId: projectId, row: row)],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取執行中成控表失敗：$error')),
    );
  }
}

class _ExecutionRowCard extends ConsumerWidget {
  const _ExecutionRowCard({required this.projectId, required this.row});

  final String projectId;
  final CostControlRow row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comparisonsAsync = ref.watch(procurementComparisonsProvider(projectId));
    final quotationAsync = ref.watch(engineeringQuotationProvider(projectId));
    final itemsById = <String, QuotationItemNode>{
      for (final (_, node) in quotationAsync.value?.flattened ?? const <(int, QuotationItemNode)>[]) node.id: node,
    };
    final vendorAdjustments = row.adjustments.where((a) => !a.isOwner).toList();

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(row.name, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                Text('業主報價 ${formatAmount(row.quoteRevenueTotal)}'),
                Text('預估成本 ${formatAmount(row.estimatedCostTotal)}'),
                Text('實際發包 ${row.awardedAmount != null ? formatAmount(row.awardedAmount!) : '未決標'}'),
                Text('業主追加減 ${formatAmount(row.ownerAdjustmentsTotal)}'),
                Text('發包追加減 ${formatAmount(row.vendorAdjustmentsTotal)}'),
                Text('業主合約 ${formatAmount(row.ownerContractAmount)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                Text('發包合約 ${formatAmount(row.vendorContractAmount)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                Text('已請款 ${formatAmount(row.billedTotal)}（${(row.billedPercent * 100).toStringAsFixed(1)}%）'),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('連結比價表：', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(width: 4),
                Text(
                  row.procurementComparisonId == null
                      ? '未連結'
                      : itemsById[comparisonsAsync.value?.firstWhereOrNull((c) => c.id == row.procurementComparisonId)?.quotationLineItemId]?.name ??
                            '（比價表）',
                ),
                TextButton(
                  onPressed: () => _linkComparison(context, ref, comparisonsAsync.value ?? const [], itemsById),
                  child: const Text('變更'),
                ),
              ],
            ),
            const Divider(height: 24),
            Text('發包端追加/追減（來自請款單，唯讀）', style: Theme.of(context).textTheme.bodyMedium),
            if (vendorAdjustments.isEmpty)
              const Padding(padding: EdgeInsets.symmetric(vertical: 4), child: Text('（尚無）', style: TextStyle(fontSize: 12)))
            else
              for (final adjustment in vendorAdjustments)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    adjustment.type == 'ADD' ? Icons.add_circle_outline : Icons.remove_circle_outline,
                    color: adjustment.type == 'ADD' ? Colors.green : Colors.red,
                    size: 18,
                  ),
                  title: Text(
                    '${formatAmount(adjustment.amount)}${adjustment.note != null ? '　${adjustment.note}' : ''}',
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Future<void> _linkComparison(
    BuildContext context,
    WidgetRef ref,
    List<ProcurementComparison> comparisons,
    Map<String, QuotationItemNode> itemsById,
  ) async {
    final selected = await showDialog<String?>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('連結採發比價表'),
        children: [
          SimpleDialogOption(onPressed: () => Navigator.of(context).pop(null), child: const Text('（不連結）')),
          for (final c in comparisons)
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(c.id),
              child: Text(itemsById[c.quotationLineItemId]?.name ?? c.id),
            ),
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
}
