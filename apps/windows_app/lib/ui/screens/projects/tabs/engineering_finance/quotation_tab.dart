import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 工程報價單 — 大項/中項/細項三層自由樹狀結構，20 大類只是預設可刪改的
/// 範本。金額只有最底層細項才有意義，複價/成本複價/毛利率跟往上彙總的
/// 總額全部是後端現算的衍生值。A（目標毛利率）/B（議價後總金額）兩種批次
/// 調整各自寫進獨立欄位，不覆蓋使用者自己填的單價。
///
/// 總表／詳細表拆成兩個子分頁（2026-08-15）：總表是業主看的彙總視圖（各
/// 大項複價/成本複價總和＋附加費用清單＋總計，唯讀彙總數字，只有附加費用
/// 本身可增刪），詳細表才是可編輯的三層樹狀明細，A/B 批次調整按鈕放在
/// 詳細表這邊（調整結果是寫進詳細表每一列的欄位）。
class QuotationTab extends ConsumerWidget {
  const QuotationTab({super.key, required this.projectId});

  final String projectId;

  static const _subTabs = [Tab(text: '總表'), Tab(text: '詳細表')];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              children: [_SummaryTab(projectId: projectId), _DetailTab(projectId: projectId)],
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _addOrEditQuotationItem(
  BuildContext context,
  WidgetRef ref,
  String projectId, {
  String? parentId,
  QuotationItemNode? item,
}) async {
    final nameController = TextEditingController(text: item?.name ?? '');
    final unitController = TextEditingController(text: item?.unit ?? '');
    final quantityController = TextEditingController(text: item?.quantity?.toString() ?? '');
    final unitPriceController = TextEditingController(text: item?.unitPrice?.toStringAsFixed(0) ?? '');
    final costUnitPriceController = TextEditingController(text: item?.costUnitPrice?.toStringAsFixed(0) ?? '');
    final noteController = TextEditingController(text: item?.note ?? '');

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(item == null ? '新增工項' : '編輯工項'),
        content: SizedBox(
          width: 360,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameController, decoration: const InputDecoration(labelText: '名稱')),
                TextField(controller: unitController, decoration: const InputDecoration(labelText: '單位（選填）')),
                TextField(
                  controller: quantityController,
                  decoration: const InputDecoration(labelText: '數量（最底層細項才填）'),
                  keyboardType: TextInputType.number,
                ),
                TextField(
                  controller: unitPriceController,
                  decoration: const InputDecoration(labelText: '單價（給業主看的）'),
                  keyboardType: TextInputType.number,
                ),
                TextField(
                  controller: costUnitPriceController,
                  decoration: const InputDecoration(labelText: '成本單價'),
                  keyboardType: TextInputType.number,
                ),
                TextField(controller: noteController, decoration: const InputDecoration(labelText: '備註（選填）')),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
        ],
      ),
    );
    if (result != true || !context.mounted) return;

    final name = nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入名稱')));
      return;
    }

    try {
      final api = ref.read(apiClientProvider);
      if (item == null) {
        await api.createQuotationItem(
          projectId: projectId,
          parentId: parentId,
          name: name,
          unit: unitController.text.trim(),
          quantity: double.tryParse(quantityController.text.trim()),
          unitPrice: double.tryParse(unitPriceController.text.trim()),
          costUnitPrice: double.tryParse(costUnitPriceController.text.trim()),
          note: noteController.text.trim(),
        );
      } else {
        await api.updateQuotationItem(
          projectId: projectId,
          itemId: item.id,
          name: name,
          unit: unitController.text.trim(),
          quantity: double.tryParse(quantityController.text.trim()),
          unitPrice: double.tryParse(unitPriceController.text.trim()),
          costUnitPrice: double.tryParse(costUnitPriceController.text.trim()),
          note: noteController.text.trim(),
        );
      }
      ref.invalidate(engineeringQuotationProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
}

/// 總表 — 業主看得到的彙總視圖：各大項（頂層節點，不下探中項/細項）的複價
/// /成本複價總和＋毛利率、附加費用清單、總計。彙總數字全部唯讀（改法在
/// 詳細表逐項編輯），只有附加費用本身可以在這裡直接增刪。
class _SummaryTab extends ConsumerWidget {
  const _SummaryTab({required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treeAsync = ref.watch(engineeringQuotationProvider(projectId));
    return treeAsync.when(
      data: (data) => _SummaryBody(projectId: projectId, data: data),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取報價單失敗：$error')),
    );
  }
}

class _SummaryBody extends ConsumerWidget {
  const _SummaryBody({required this.projectId, required this.data});

  final String projectId;
  final EngineeringQuotationTree data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final topLevelTotal = data.tree.fold<double>(0, (sum, n) => sum + n.complexPrice);
    final topLevelCostTotal = data.tree.fold<double>(0, (sum, n) => sum + n.costComplexPrice);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '工程總金額 ${formatAmount(data.grandTotalBeforeSurcharge)}　'
            '成本 ${formatAmount(data.grandCostTotalBeforeSurcharge)}　'
            '附加費用 ${formatAmount(data.surchargeTotal)}　'
            '總計 ${formatAmount(data.grandTotal)}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          if (data.tree.isEmpty)
            const Text('還沒有任何大項，請到「詳細表」新增')
          else
            DataTable(
              columns: const [
                DataColumn(label: Text('大項')),
                DataColumn(label: Text('複價'), numeric: true),
                DataColumn(label: Text('成本複價'), numeric: true),
                DataColumn(label: Text('毛利率'), numeric: true),
              ],
              rows: [
                for (final node in data.tree)
                  DataRow(
                    cells: [
                      DataCell(Text(node.name)),
                      DataCell(Text(formatAmount(node.complexPrice))),
                      DataCell(Text(formatAmount(node.costComplexPrice))),
                      DataCell(Text('${(node.marginRate * 100).toStringAsFixed(1)}%')),
                    ],
                  ),
                DataRow(
                  cells: [
                    const DataCell(Text('合計', style: TextStyle(fontWeight: FontWeight.w700))),
                    DataCell(Text(formatAmount(topLevelTotal), style: const TextStyle(fontWeight: FontWeight.w700))),
                    DataCell(Text(formatAmount(topLevelCostTotal), style: const TextStyle(fontWeight: FontWeight.w700))),
                    const DataCell(Text('')),
                  ],
                ),
              ],
            ),
          const SizedBox(height: 32),
          Row(
            children: [
              Text('附加費用', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              OutlinedButton.icon(
                onPressed: () => _addOrEditSurcharge(context, ref),
                icon: const Icon(Icons.add),
                label: const Text('新增附加費用'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (data.surchargeItems.isEmpty)
            const Padding(padding: EdgeInsets.symmetric(vertical: 4), child: Text('（尚無附加費用）'))
          else
            for (final item in data.surchargeItems)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${item.name}　${item.percent}%${item.isTaxLike ? '（稅金特例）' : ''}'),
                subtitle: Text(formatAmount(item.amount)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      onPressed: () => _addOrEditSurcharge(context, ref, item: item),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline, size: 18),
                      onPressed: () => _deleteSurcharge(context, ref, item),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }

  Future<void> _deleteSurcharge(BuildContext context, WidgetRef ref, QuotationSurchargeItem item) async {
    try {
      await ref.read(apiClientProvider).deleteSurchargeItem(projectId, item.id);
      ref.invalidate(engineeringQuotationProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _addOrEditSurcharge(BuildContext context, WidgetRef ref, {QuotationSurchargeItem? item}) async {
    final nameController = TextEditingController(text: item?.name ?? '');
    final percentController = TextEditingController(text: item?.percent.toString() ?? '');
    bool isTaxLike = item?.isTaxLike ?? false;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(item == null ? '新增附加費用' : '編輯附加費用'),
          content: SizedBox(
            width: 320,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameController, decoration: const InputDecoration(labelText: '名稱')),
                TextField(
                  controller: percentController,
                  decoration: const InputDecoration(labelText: '百分比（例如 5 代表 5%）'),
                  keyboardType: TextInputType.number,
                ),
                CheckboxListTile(
                  value: isTaxLike,
                  onChanged: (v) => setState(() => isTaxLike = v ?? false),
                  title: const Text('稅金特例'),
                  subtitle: const Text('計算基礎是「工程總金額＋其他附加費用」加總後才乘百分比', style: TextStyle(fontSize: 11)),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final name = nameController.text.trim();
    final percent = double.tryParse(percentController.text.trim());
    if (name.isEmpty || percent == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請確認欄位都有正確填寫')));
      return;
    }
    try {
      final api = ref.read(apiClientProvider);
      if (item == null) {
        await api.createSurchargeItem(projectId: projectId, name: name, percent: percent, isTaxLike: isTaxLike);
      } else {
        await api.updateSurchargeItem(
          projectId: projectId,
          surchargeId: item.id,
          name: name,
          percent: percent,
          isTaxLike: isTaxLike,
        );
      }
      ref.invalidate(engineeringQuotationProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

/// 詳細表 — 可編輯的三層樹狀明細，A/B 批次調整按鈕放這裡（結果寫進這裡
/// 每一列的欄位）。
class _DetailTab extends ConsumerWidget {
  const _DetailTab({required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treeAsync = ref.watch(engineeringQuotationProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addOrEditQuotationItem(context, ref, projectId, parentId: null),
        icon: const Icon(Icons.add),
        label: const Text('新增大項'),
      ),
      body: treeAsync.when(
        data: (data) => _DetailBody(projectId: projectId, data: data),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取報價單失敗：$error')),
      ),
    );
  }
}

class _DetailBody extends ConsumerWidget {
  const _DetailBody({required this.projectId, required this.data});

  final String projectId;
  final EngineeringQuotationTree data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flattened = data.flattened;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton.icon(
                onPressed: () => _applyMarginTarget(context, ref),
                icon: const Icon(Icons.calculate_outlined),
                label: const Text('A. 設定目標毛利率'),
              ),
              OutlinedButton.icon(
                onPressed: () => _applyNegotiatedTotal(context, ref),
                icon: const Icon(Icons.price_change_outlined),
                label: const Text('B. 議價後總金額'),
              ),
            ],
          ),
        ),
        if (flattened.isEmpty)
          const Expanded(child: Center(child: Text('還沒有任何工項，按右下角新增')))
        else
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SizedBox(
                width: 1180,
                child: Column(
                  children: [
                    const _QuotationHeaderRow(),
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.only(bottom: 96),
                        itemCount: flattened.length,
                        itemBuilder: (context, index) {
                          final (depth, node) = flattened[index];
                          return _QuotationItemRow(projectId: projectId, depth: depth, node: node);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _applyMarginTarget(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: data.quotation.lastTargetMarginPercent?.toString() ?? '');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('A. 設定目標毛利率'),
        content: SizedBox(
          width: 320,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: controller,
                decoration: const InputDecoration(labelText: '目標毛利率（例如 20 代表 20%）'),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 8),
              const Text(
                '套用到所有已填成本單價的細項，寫進「毛利率調整單價」欄位，不會覆蓋您自己填的單價。',
                style: TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('套用')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final percent = double.tryParse(controller.text.trim());
    if (percent == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入正確的數字')));
      return;
    }
    try {
      await ref.read(apiClientProvider).applyMarginTarget(projectId: projectId, targetMarginPercent: percent);
      ref.invalidate(engineeringQuotationProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _applyNegotiatedTotal(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: data.quotation.lastNegotiatedTotalAmount?.toStringAsFixed(0) ?? '');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('B. 議價後總金額'),
        content: SizedBox(
          width: 320,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: controller,
                decoration: const InputDecoration(labelText: '業主議定的最終總金額'),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 8),
              const Text(
                '依現有複價佔比分攤，寫進「議價後單價」欄位，不會覆蓋您自己填的單價。',
                style: TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('套用')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final amount = double.tryParse(controller.text.trim());
    if (amount == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入正確的數字')));
      return;
    }
    try {
      await ref.read(apiClientProvider).applyNegotiatedTotal(projectId: projectId, negotiatedTotalAmount: amount);
      ref.invalidate(engineeringQuotationProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _QuotationHeaderRow extends StatelessWidget {
  const _QuotationHeaderRow();

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelMedium;
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outlineVariant))),
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(width: 260, child: Text('工項', style: style)),
          SizedBox(width: 60, child: Text('單位', style: style)),
          SizedBox(width: 70, child: Text('數量', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 90, child: Text('單價', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text('複價', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 90, child: Text('成本單價', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text('成本複價', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 70, child: Text('毛利率', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text('A建議單價', style: style, textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text('B議價後單價', style: style, textAlign: TextAlign.right)),
          const SizedBox(width: 90, child: Text('')),
        ],
      ),
    );
  }
}

class _QuotationItemRow extends ConsumerWidget {
  const _QuotationItemRow({required this.projectId, required this.depth, required this.node});

  final String projectId;
  final int depth;
  final QuotationItemNode node;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fontWeight = node.isLeaf ? FontWeight.normal : FontWeight.w600;
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outlineVariant.withValues(alpha: 0.4)))),
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 260,
            child: Padding(
              padding: EdgeInsets.only(left: depth * 20.0),
              child: Text(node.name, style: TextStyle(fontWeight: fontWeight), overflow: TextOverflow.ellipsis),
            ),
          ),
          SizedBox(width: 60, child: Text(node.unit ?? '')),
          SizedBox(width: 70, child: Text(_numOrDash(node.quantity), textAlign: TextAlign.right)),
          SizedBox(width: 90, child: Text(_amountOrDash(node.unitPrice), textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text(formatAmount(node.complexPrice), textAlign: TextAlign.right)),
          SizedBox(width: 90, child: Text(_amountOrDash(node.costUnitPrice), textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text(formatAmount(node.costComplexPrice), textAlign: TextAlign.right)),
          SizedBox(width: 70, child: Text('${(node.marginRate * 100).toStringAsFixed(1)}%', textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text(_amountOrDash(node.marginAdjustedUnitPrice), textAlign: TextAlign.right)),
          SizedBox(width: 100, child: Text(_amountOrDash(node.negotiatedUnitPrice), textAlign: TextAlign.right)),
          SizedBox(
            width: 90,
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.add, size: 16),
                  tooltip: '新增子項',
                  onPressed: () => _addChild(context, ref),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  onPressed: () => _edit(context, ref),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 16),
                  onPressed: () => _delete(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _addChild(BuildContext context, WidgetRef ref) =>
      _addOrEditQuotationItem(context, ref, projectId, parentId: node.id);

  Future<void> _edit(BuildContext context, WidgetRef ref) =>
      _addOrEditQuotationItem(context, ref, projectId, item: node);

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除工項'),
        content: Text('確定要刪除「${node.name}」嗎？${node.children.isNotEmpty ? '（含底下所有子項）' : ''}'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteQuotationItem(projectId, node.id);
      ref.invalidate(engineeringQuotationProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

String _numOrDash(double? value) => value == null ? '－' : value.toStringAsFixed(value == value.roundToDouble() ? 0 : 2);
String _amountOrDash(double? value) => value == null ? '－' : formatAmount(value);
