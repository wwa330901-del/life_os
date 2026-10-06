import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../../../../state/home_provider.dart';
import '../../../../state/stocks_provider.dart';

/// 清空記帳重來：很久沒記、帳對不起來時一次清掉所有紀錄（交易、借貸、代墊、
/// 股票）。預設保留帳戶/分類/預算/定期交易，並讓使用者填每個帳戶現在實際有多少錢；
/// 也可以選全部刪掉從零開始。要打「清空」兩個字才按得下去。
Future<void> showFinanceResetDialog(BuildContext context, WidgetRef ref, String spaceId) async {
  final List<FinanceAccount> accounts;
  try {
    accounts = await ref.read(apiClientProvider).listFinanceAccounts(spaceId);
  } on ApiException catch (e) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    return;
  }
  if (!context.mounted) return;

  final balanceControllers = {
    for (final a in accounts) a.id: TextEditingController(text: a.balance.toStringAsFixed(0)),
  };
  final confirmController = TextEditingController();
  var deleteSetup = false;

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final theme = Theme.of(context);
        return AlertDialog(
          title: const Text('清空記帳重來'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('會刪掉：所有交易紀錄、借貸、代墊、股票交易和持股、淨資產趨勢、理財評估。'),
                  const SizedBox(height: 4),
                  Text('購物車、退休試算、人生目標不會動。刪掉後無法復原。', style: theme.textTheme.bodySmall),
                  const SizedBox(height: 12),
                  RadioGroup<bool>(
                    groupValue: deleteSetup,
                    onChanged: (v) => setState(() => deleteSetup = v ?? false),
                    child: const Column(
                      children: [
                        RadioListTile<bool>(
                          contentPadding: EdgeInsets.zero,
                          value: false,
                          title: Text('保留帳戶、分類、預算、定期交易（建議）'),
                          subtitle: Text('只清紀錄，設定都留著，直接接著記'),
                        ),
                        RadioListTile<bool>(
                          contentPadding: EdgeInsets.zero,
                          value: true,
                          title: Text('全部刪掉，完全從零開始'),
                          subtitle: Text('帳戶、分類、預算、定期交易、定期定額也一起刪'),
                        ),
                      ],
                    ),
                  ),
                  if (!deleteSetup && accounts.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('每個帳戶現在實際有多少錢？（信用卡欠款填負數）', style: theme.textTheme.titleSmall),
                    const SizedBox(height: 4),
                    for (final a in accounts)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextField(
                          controller: balanceControllers[a.id],
                          keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                          decoration: InputDecoration(labelText: a.name, isDense: true),
                        ),
                      ),
                  ],
                  const SizedBox(height: 16),
                  TextField(
                    controller: confirmController,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(labelText: '確定的話請輸入「清空」'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: theme.colorScheme.error),
              onPressed: confirmController.text.trim() == '清空' ? () => Navigator.of(context).pop(true) : null,
              child: const Text('清空'),
            ),
          ],
        );
      },
    ),
  );
  if (confirmed != true || !context.mounted) return;

  final balances = <String, double>{};
  for (final a in accounts) {
    final value = double.tryParse(balanceControllers[a.id]!.text.replaceAll(',', '').trim());
    if (value != null) balances[a.id] = value;
  }

  final messenger = ScaffoldMessenger.of(context);
  try {
    await ref.read(apiClientProvider).resetFinance(spaceId: spaceId, deleteSetup: deleteSetup, balances: balances);
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text('清空失敗：${e.message}')));
    return;
  }

  ref
    ..invalidate(financeAccountsProvider)
    ..invalidate(financeCategoriesProvider)
    ..invalidate(financeTransactionsProvider)
    ..invalidate(financeSummaryProvider)
    ..invalidate(financeTrendProvider)
    ..invalidate(financeReportProvider)
    ..invalidate(financeHealthProvider)
    ..invalidate(financeBudgetsProvider)
    ..invalidate(financeBudgetStatusProvider)
    ..invalidate(financeRecurringTransactionsProvider)
    ..invalidate(financeLoansProvider)
    ..invalidate(financeAdvancesProvider)
    ..invalidate(financePlanProvider)
    ..invalidate(wishlistProvider)
    ..invalidate(retirementProvider)
    ..invalidate(stockHoldingsProvider)
    ..invalidate(stockTransactionsProvider)
    ..invalidate(stockRecurringInvestmentsProvider)
    ..invalidate(homeDashboardProvider);
  messenger.showSnackBar(const SnackBar(content: Text('記帳已清空，可以重新開始記了')));
}
