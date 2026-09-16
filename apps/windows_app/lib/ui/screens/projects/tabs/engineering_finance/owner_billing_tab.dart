import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 業主端估驗計價（對業主收款）— 顧問文件「對業主（估驗計價）＋對廠商兩
/// 類請款單」的業主端那一半，PaymentRequestPeriod 是對廠商付款的另一半。
/// 掛在專案底下，不綁定任何一個發包，金額由使用者依實際估驗進度手動輸
/// 入。純記錄與匯出用途，不走簽核，所以（跟工程請款單不同）支援編輯/刪除
/// 既有期別。
class OwnerBillingTab extends ConsumerWidget {
  const OwnerBillingTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(ownerBillingPeriodsProvider(projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createOrEdit(context, ref, projectId: projectId),
        icon: const Icon(Icons.add),
        label: const Text('新增估驗期別'),
      ),
      body: listAsync.when(
        data: (periods) {
          if (periods.isEmpty) return const Center(child: Text('還沒有任何估驗計價紀錄，按右下角新增'));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [for (final period in periods) _PeriodCard(projectId: projectId, period: period)],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取估驗計價紀錄失敗：$error')),
      ),
    );
  }

  static Future<void> _createOrEdit(
    BuildContext context,
    WidgetRef ref, {
    required String projectId,
    OwnerBillingPeriod? existing,
  }) async {
    final periodLabelController = TextEditingController(text: existing?.periodLabel ?? '');
    final amountController = TextEditingController(text: existing?.amount.toStringAsFixed(0) ?? '');
    final noteController = TextEditingController(text: existing?.note ?? '');
    DateTime requestDate = existing?.requestDate ?? DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增估驗期別' : '編輯估驗期別'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: periodLabelController,
                    decoration: const InputDecoration(labelText: '期別名稱（例如「第一期估驗」）'),
                  ),
                  TextField(
                    controller: amountController,
                    decoration: const InputDecoration(labelText: '本期估驗金額'),
                    keyboardType: TextInputType.number,
                  ),
                  Row(
                    children: [
                      Expanded(child: Text('估驗日期：${requestDate.year}/${requestDate.month}/${requestDate.day}')),
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
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(existing == null ? '新增' : '儲存'),
            ),
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
      if (existing == null) {
        await ref
            .read(apiClientProvider)
            .createOwnerBillingPeriod(
              projectId: projectId,
              periodLabel: periodLabel,
              amount: amount,
              requestDate: requestDate,
              note: noteController.text.trim(),
            );
      } else {
        await ref
            .read(apiClientProvider)
            .updateOwnerBillingPeriod(
              projectId: projectId,
              periodId: existing.id,
              periodLabel: periodLabel,
              amount: amount,
              requestDate: requestDate,
              note: noteController.text.trim(),
            );
      }
      ref.invalidate(ownerBillingPeriodsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _PeriodCard extends ConsumerWidget {
  const _PeriodCard({required this.projectId, required this.period});

  final String projectId;
  final OwnerBillingPeriod period;

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
                  child: Text(period.periodLabel, style: Theme.of(context).textTheme.titleMedium),
                ),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  onPressed: () =>
                      OwnerBillingTab._createOrEdit(context, ref, projectId: projectId, existing: period),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  onPressed: () => _delete(context, ref),
                ),
              ],
            ),
            Text(
              '${formatAmount(period.amount)}　'
              '估驗日期 ${period.requestDate.year}/${period.requestDate.month}/${period.requestDate.day}',
            ),
            Text(
              '合約金額快照 ${formatAmount(period.contractAmountSnapshot)}　'
              '建立前已估驗 ${(period.billedPercentBefore * 100).toStringAsFixed(1)}%',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (period.note != null && period.note!.isNotEmpty) Text(period.note!),
            const SizedBox(height: 8),
            Row(
              children: [
                if (period.collectedDate != null)
                  const Chip(label: Text('已收款'), visualDensity: VisualDensity.compact)
                else ...[
                  const Chip(label: Text('未收款'), visualDensity: VisualDensity.compact),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: () => _markCollected(context, ref),
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('標記已收款'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _markCollected(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).markOwnerBillingPeriodCollected(projectId: projectId, periodId: period.id);
      ref.invalidate(ownerBillingPeriodsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除估驗期別'),
        content: Text('確定要刪除「${period.periodLabel}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteOwnerBillingPeriod(projectId: projectId, periodId: period.id);
      ref.invalidate(ownerBillingPeriodsProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
