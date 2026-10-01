import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';

class FinanceAccountsTab extends ConsumerWidget {
  const FinanceAccountsTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accountsAsync = ref.watch(financeAccountsProvider(spaceId));

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('新增帳戶'),
      ),
      body: accountsAsync.when(
        data: (accounts) {
          if (accounts.isEmpty) {
            return const Center(child: Text('還沒有任何帳戶，點右下角新增一個吧'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: accounts.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final account = accounts[index];
              return Card(
                child: ListTile(
                  leading: Icon(_iconFor(account.type)),
                  title: Text(account.name),
                  subtitle: Text(account.type.label),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _balanceLabel(account),
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: account.balance < 0 ? Theme.of(context).colorScheme.error : null,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        onPressed: () => _openEditor(context, ref, account),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 18),
                        onPressed: () => _delete(context, ref, account),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取帳戶失敗：$error')),
      ),
    );
  }

  /// A credit card's derived balance works the same way every other
  /// account's does (initialBalance − expenses + income/transfers-in) —
  /// but for a credit card, going negative means "this much is owed to the
  /// card issuer," not "spent past zero." Paying off the card is just a
  /// transfer from a bank/cash account into the card account, which brings
  /// this back toward zero. Labeling it "欠款" instead of a bare negative
  /// number make that reading explicit instead of looking like an error.
  String _balanceLabel(FinanceAccount account) {
    if (account.type == FinanceAccountType.creditCard && account.balance < 0) {
      return '欠款 ${formatAmount(-account.balance)}';
    }
    return formatAmount(account.balance);
  }

  IconData _iconFor(FinanceAccountType type) => switch (type) {
    FinanceAccountType.cash => Icons.payments_outlined,
    FinanceAccountType.bank => Icons.account_balance_outlined,
    FinanceAccountType.creditCard => Icons.credit_card_outlined,
    FinanceAccountType.other => Icons.savings_outlined,
  };

  Future<void> _openEditor(BuildContext context, WidgetRef ref, FinanceAccount? existing) async {
    final nameController = TextEditingController(text: existing?.name ?? '');
    final balanceController = TextEditingController(
      text: existing == null ? '0' : existing.initialBalance.toStringAsFixed(0),
    );
    var type = existing?.type ?? FinanceAccountType.cash;
    int? statementDay = existing?.statementDay;
    int? paymentDueDay = existing?.paymentDueDay;
    String? paymentAccountId = existing?.paymentAccountId;
    var autoPay = existing?.cardAutoPay ?? false;
    final otherAccounts = (ref.read(financeAccountsProvider(spaceId)).value ?? const <FinanceAccount>[])
        .where((a) => a.id != existing?.id && a.type != FinanceAccountType.creditCard)
        .toList();
    if (paymentAccountId != null && !otherAccounts.any((a) => a.id == paymentAccountId)) paymentAccountId = null;
    final dayItems = [
      const DropdownMenuItem<int?>(value: null, child: Text('不設定')),
      for (var d = 1; d <= 31; d++) DropdownMenuItem<int?>(value: d, child: Text('每月 $d 號')),
    ];

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增帳戶' : '編輯帳戶'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: const InputDecoration(labelText: '帳戶名稱'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<FinanceAccountType>(
                initialValue: type,
                decoration: const InputDecoration(labelText: '類型'),
                items: FinanceAccountType.values
                    .map((t) => DropdownMenuItem(value: t, child: Text(t.label)))
                    .toList(),
                onChanged: (value) => setState(() => type = value ?? type),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: balanceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '期初餘額'),
              ),
              if (type == FinanceAccountType.creditCard) ...[
                const SizedBox(height: 16),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '繳款提醒：設好結帳日和繳款日，繳款日前 3 天和當天 LINE 會提醒要繳多少',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<int?>(
                        initialValue: statementDay,
                        decoration: const InputDecoration(labelText: '結帳日'),
                        items: dayItems,
                        onChanged: (v) => setState(() => statementDay = v),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<int?>(
                        initialValue: paymentDueDay,
                        decoration: const InputDecoration(labelText: '繳款日'),
                        items: dayItems,
                        onChanged: (v) => setState(() => paymentDueDay = v),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String?>(
                  initialValue: paymentAccountId,
                  decoration: const InputDecoration(labelText: '扣款帳戶'),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('不設定')),
                    for (final a in otherAccounts) DropdownMenuItem<String?>(value: a.id, child: Text(a.name)),
                  ],
                  onChanged: (v) => setState(() => paymentAccountId = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('自動扣繳'),
                  subtitle: const Text('繳款日自動記一筆從扣款帳戶轉過來'),
                  value: autoPay,
                  onChanged: paymentAccountId == null ? null : (v) => setState(() => autoPay = v),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;

    final name = nameController.text.trim();
    if (name.isEmpty) return;
    final balance = double.tryParse(balanceController.text) ?? 0;

    final api = ref.read(apiClientProvider);
    final container = ProviderScope.containerOf(context, listen: false);
    final card = type == FinanceAccountType.creditCard
        ? CreditCardSettings(
            statementDay: statementDay,
            paymentDueDay: paymentDueDay,
            paymentAccountId: paymentAccountId,
            autoPay: paymentAccountId != null && autoPay,
          )
        : null;
    try {
      if (existing == null) {
        final id = await api.createFinanceAccount(spaceId: spaceId, name: name, type: type, initialBalance: balance);
        if (card != null && (card.statementDay != null || card.paymentDueDay != null || card.paymentAccountId != null)) {
          await api.updateFinanceAccount(spaceId: spaceId, accountId: id, card: card);
        }
      } else {
        await api.updateFinanceAccount(
          spaceId: spaceId,
          accountId: existing.id,
          name: name,
          type: type,
          initialBalance: balance,
          card: card,
        );
      }
      container.invalidate(financeAccountsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, FinanceAccount account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除帳戶'),
        content: Text('確定要刪除「${account.name}」嗎？這個帳戶底下的交易紀錄也會一併刪除，無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteFinanceAccount(spaceId: spaceId, accountId: account.id);
      ref.invalidate(financeAccountsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
