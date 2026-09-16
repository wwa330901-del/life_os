import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/petty_cash.dart';
import '../../../core/models/project.dart';
import '../../../state/auth_provider.dart';
import '../../../state/petty_cash_provider.dart';
import '../finance/widgets/finance_format.dart';

/// 零用金規則（2026-09，顧問文件財務系統子項）——掛在公司空間底下，全空
/// 間共用同一本帳。projectId 選填，只是「這筆支出花在哪個專案」的標記，
/// 不影響餘額計算範圍。
class PettyCashScreen extends ConsumerWidget {
  const PettyCashScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ledgerAsync = ref.watch(pettyCashProvider(spaceId));

    return Scaffold(
      appBar: AppBar(title: const Text('零用金')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addTransaction(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增紀錄'),
      ),
      body: ledgerAsync.when(
        data: (ledger) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Card(
                  color: ledger.balance < 0 ? Colors.red.shade50 : null,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        const Text('目前餘額', style: TextStyle(fontSize: 16)),
                        const SizedBox(width: 12),
                        Text(
                          formatAmount(ledger.balance),
                          style: Theme.of(
                            context,
                          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ledger.transactions.isEmpty
                    ? const Center(child: Text('還沒有任何零用金紀錄，按右下角新增'))
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
                        itemCount: ledger.transactions.length,
                        separatorBuilder: (_, _) => const Divider(),
                        itemBuilder: (context, index) {
                          final t = ledger.transactions[index];
                          final isDeposit = t.type == PettyCashType.deposit;
                          return ListTile(
                            leading: Icon(
                              isDeposit ? Icons.add_circle_outline : Icons.remove_circle_outline,
                              color: isDeposit ? Colors.green : Colors.red,
                            ),
                            title: Text(t.purpose),
                            subtitle: Text(
                              '${t.transactionDate.year}/${t.transactionDate.month}/${t.transactionDate.day}'
                              '${t.projectName != null ? '　${t.projectName}' : ''}',
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '${isDeposit ? '+' : '-'}${formatAmount(t.amount)}',
                                  style: TextStyle(
                                    color: isDeposit ? Colors.green.shade700 : Colors.red.shade700,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18),
                                  onPressed: () => _delete(context, ref, t),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取零用金紀錄失敗：$error')),
      ),
    );
  }

  Future<void> _addTransaction(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    List<Project> projects = const [];
    try {
      projects = await api.listProjects(spaceId);
    } on ApiException {
      // 專案清單抓不到不擋新增流程，只是這筆紀錄不能標記專案。
    }
    if (!context.mounted) return;

    final purposeController = TextEditingController();
    final amountController = TextEditingController();
    PettyCashType type = PettyCashType.expense;
    DateTime transactionDate = DateTime.now();
    String? selectedProjectId;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增零用金紀錄'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SegmentedButton<PettyCashType>(
                    segments: const [
                      ButtonSegment(value: PettyCashType.deposit, label: Text('存入')),
                      ButtonSegment(value: PettyCashType.expense, label: Text('支出')),
                    ],
                    selected: {type},
                    onSelectionChanged: (s) => setState(() => type = s.first),
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: purposeController, decoration: const InputDecoration(labelText: '用途')),
                  TextField(
                    controller: amountController,
                    decoration: const InputDecoration(labelText: '金額'),
                    keyboardType: TextInputType.number,
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text('日期：${transactionDate.year}/${transactionDate.month}/${transactionDate.day}'),
                      ),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: transactionDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => transactionDate = picked);
                        },
                        child: const Text('選擇日期'),
                      ),
                    ],
                  ),
                  if (projects.isNotEmpty)
                    DropdownButtonFormField<String?>(
                      initialValue: selectedProjectId,
                      decoration: const InputDecoration(labelText: '關聯專案（選填）'),
                      items: [
                        const DropdownMenuItem<String?>(value: null, child: Text('不指定')),
                        for (final p in projects) DropdownMenuItem<String?>(value: p.id, child: Text(p.name)),
                      ],
                      onChanged: (value) => setState(() => selectedProjectId = value),
                    ),
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

    final purpose = purposeController.text.trim();
    final amount = double.tryParse(amountController.text.trim());
    if (purpose.isEmpty || amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請確認用途跟金額都有正確填寫')));
      return;
    }

    try {
      await api.createPettyCashTransaction(
        spaceId: spaceId,
        transactionDate:
            '${transactionDate.year.toString().padLeft(4, '0')}-${transactionDate.month.toString().padLeft(2, '0')}-${transactionDate.day.toString().padLeft(2, '0')}',
        type: type,
        amount: amount,
        purpose: purpose,
        projectId: selectedProjectId,
      );
      ref.invalidate(pettyCashProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, PettyCashTransaction transaction) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除零用金紀錄'),
        content: Text('確定要刪除「${transaction.purpose}」這筆紀錄嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deletePettyCashTransaction(spaceId, transaction.id);
      ref.invalidate(pettyCashProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
