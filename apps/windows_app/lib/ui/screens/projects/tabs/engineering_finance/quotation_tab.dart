import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 工程報價單 — 一個專案只有一份，工項數量不固定，隨案子調整。業主報價/
/// 成本並列輸入，複價/成本複價/利潤/毛利率都是後端現算的衍生值。
class QuotationTab extends ConsumerWidget {
  const QuotationTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(quotationItemsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addOrEdit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增工項'),
      ),
      body: listAsync.when(
        data: (list) {
          if (list.items.isEmpty) {
            return const Center(child: Text('還沒有任何工項，按右下角新增'));
          }
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _applyTargetDialog(context, ref, list.items),
                      icon: const Icon(Icons.calculate_outlined),
                      label: const Text('設定目標毛利率／目標總金額'),
                    ),
                    const Spacer(),
                    Text(
                      '複價合計 ${formatAmount(list.summary.complexPrice)}　'
                      '成本合計 ${formatAmount(list.summary.costComplexPrice)}　'
                      '利潤 ${formatAmount(list.summary.profit)}　'
                      '毛利率 ${(list.summary.marginRate * 100).toStringAsFixed(1)}%',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('工項')),
                      DataColumn(label: Text('單價'), numeric: true),
                      DataColumn(label: Text('數量'), numeric: true),
                      DataColumn(label: Text('複價'), numeric: true),
                      DataColumn(label: Text('成本單價'), numeric: true),
                      DataColumn(label: Text('成本複價'), numeric: true),
                      DataColumn(label: Text('利潤'), numeric: true),
                      DataColumn(label: Text('毛利率'), numeric: true),
                      DataColumn(label: Text('')),
                    ],
                    rows: [
                      for (final item in list.items)
                        DataRow(
                          cells: [
                            DataCell(Text(item.name)),
                            DataCell(Text(formatAmount(item.unitPrice))),
                            DataCell(Text(item.quantity.toStringAsFixed(item.quantity == item.quantity.roundToDouble() ? 0 : 2))),
                            DataCell(Text(formatAmount(item.complexPrice))),
                            DataCell(Text(formatAmount(item.costUnitPrice))),
                            DataCell(Text(formatAmount(item.costComplexPrice))),
                            DataCell(Text(formatAmount(item.profit))),
                            DataCell(Text('${(item.marginRate * 100).toStringAsFixed(1)}%')),
                            DataCell(
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.edit_outlined, size: 18),
                                    onPressed: () => _addOrEdit(context, ref, item: item),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline, size: 18),
                                    onPressed: () => _delete(context, ref, item),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取報價單失敗：$error')),
      ),
    );
  }

  Future<void> _addOrEdit(BuildContext context, WidgetRef ref, {QuotationItem? item}) async {
    final nameController = TextEditingController(text: item?.name ?? '');
    final unitPriceController = TextEditingController(text: item?.unitPrice.toStringAsFixed(0) ?? '');
    final quantityController = TextEditingController(text: item?.quantity.toString() ?? '');
    final costUnitPriceController = TextEditingController(text: item?.costUnitPrice.toStringAsFixed(0) ?? '');

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(item == null ? '新增工項' : '編輯工項'),
        content: SizedBox(
          width: 360,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: '工項名稱')),
              TextField(
                controller: unitPriceController,
                decoration: const InputDecoration(labelText: '業主報價單價'),
                keyboardType: TextInputType.number,
              ),
              TextField(
                controller: quantityController,
                decoration: const InputDecoration(labelText: '數量'),
                keyboardType: TextInputType.number,
              ),
              TextField(
                controller: costUnitPriceController,
                decoration: const InputDecoration(labelText: '成本單價'),
                keyboardType: TextInputType.number,
              ),
            ],
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
    final unitPrice = double.tryParse(unitPriceController.text.trim());
    final quantity = double.tryParse(quantityController.text.trim());
    final costUnitPrice = double.tryParse(costUnitPriceController.text.trim());
    if (name.isEmpty || unitPrice == null || quantity == null || costUnitPrice == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請確認欄位都有正確填寫')));
      return;
    }

    try {
      final api = ref.read(apiClientProvider);
      if (item == null) {
        await api.createQuotationItem(
          projectId: projectId,
          name: name,
          unitPrice: unitPrice,
          quantity: quantity,
          costUnitPrice: costUnitPrice,
        );
      } else {
        await api.updateQuotationItem(
          projectId: projectId,
          itemId: item.id,
          name: name,
          unitPrice: unitPrice,
          quantity: quantity,
          costUnitPrice: costUnitPrice,
        );
      }
      ref.invalidate(quotationItemsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, QuotationItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除工項'),
        content: Text('確定要刪除「${item.name}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ref.read(apiClientProvider).deleteQuotationItem(projectId, item.id);
      ref.invalidate(quotationItemsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _applyTargetDialog(BuildContext context, WidgetRef ref, List<QuotationItem> items) async {
    String mode = 'MARGIN';
    final marginController = TextEditingController();
    final totalController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('設定目標毛利率／目標總金額'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RadioListTile<String>(
                  value: 'MARGIN',
                  groupValue: mode,
                  onChanged: (v) => setState(() => mode = v!),
                  title: const Text('設定目標毛利率'),
                  subtitle: const Text('每個工項都套用同一個毛利率反推單價'),
                ),
                if (mode == 'MARGIN')
                  Padding(
                    padding: const EdgeInsets.only(left: 16, right: 16, bottom: 8),
                    child: TextField(
                      controller: marginController,
                      decoration: const InputDecoration(labelText: '目標毛利率（例如 20 代表 20%）'),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                RadioListTile<String>(
                  value: 'TOTAL',
                  groupValue: mode,
                  onChanged: (v) => setState(() => mode = v!),
                  title: const Text('設定目標總金額'),
                  subtitle: const Text('依現有複價佔比分攤到這個總金額'),
                ),
                if (mode == 'TOTAL')
                  Padding(
                    padding: const EdgeInsets.only(left: 16, right: 16, bottom: 8),
                    child: TextField(
                      controller: totalController,
                      decoration: const InputDecoration(labelText: '目標總金額'),
                      keyboardType: TextInputType.number,
                    ),
                  ),
                const Text('會套用到目前整張報價單所有工項，這是一次性計算，之後仍可個別調整。', style: TextStyle(fontSize: 12)),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('套用')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    double? targetMarginRate;
    if (mode == 'MARGIN') {
      final parsed = double.tryParse(marginController.text.trim());
      if (parsed != null) targetMarginRate = parsed / 100;
    }
    final targetTotalAmount = mode == 'TOTAL' ? double.tryParse(totalController.text.trim()) : null;
    if ((mode == 'MARGIN' && targetMarginRate == null) || (mode == 'TOTAL' && targetTotalAmount == null)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入正確的數字')));
      return;
    }

    try {
      await ref.read(apiClientProvider).applyQuotationTarget(
        projectId: projectId,
        mode: mode,
        targetMarginRate: targetMarginRate,
        targetTotalAmount: targetTotalAmount,
      );
      ref.invalidate(quotationItemsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
