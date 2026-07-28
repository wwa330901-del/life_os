import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';

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
                        account.balance.toStringAsFixed(0),
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

    try {
      if (existing == null) {
        await ref
            .read(apiClientProvider)
            .createFinanceAccount(spaceId: spaceId, name: name, type: type, initialBalance: balance);
      } else {
        await ref.read(apiClientProvider).updateFinanceAccount(
          spaceId: spaceId,
          accountId: existing.id,
          name: name,
          type: type,
          initialBalance: balance,
        );
      }
      ref.invalidate(financeAccountsProvider(spaceId));
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
