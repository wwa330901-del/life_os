import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../../../../state/stocks_provider.dart';

/// 股票帳戶（2026-10-07）：股票買賣通常都走同一個交割帳戶，設一次之後新增
/// 交易／定期定額預設選它，LINE「買股」和 AI 記股票沒講帳戶也用它。
class StockAccountButton extends ConsumerWidget {
  const StockAccountButton({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final accounts = ref.watch(financeAccountsProvider(spaceId)).value ?? const [];
    final accountId = ref.watch(stockAccountIdProvider(spaceId)).value;
    final name = accounts.where((a) => a.id == accountId).firstOrNull?.name;

    return TextButton.icon(
      onPressed: accounts.isEmpty ? null : () => _pick(context, ref, accountId),
      icon: const Icon(Icons.account_balance_outlined, size: 18),
      label: Text(name == null ? '設定股票帳戶' : '股票帳戶：$name'),
    );
  }

  Future<void> _pick(BuildContext context, WidgetRef ref, String? current) async {
    final accounts = ref.read(financeAccountsProvider(spaceId)).value ?? const [];
    // '' 代表「不指定」，跟按取消（null）分開。
    final picked = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('股票帳戶'),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 0, 24, 8),
            child: Text('股票買賣固定用哪個帳戶交割？設定後新增交易就不用每次選，LINE 和 AI 記股票也會用它。'),
          ),
          for (final a in accounts)
            ListTile(
              leading: Icon(a.id == current ? Icons.radio_button_checked : Icons.radio_button_unchecked),
              title: Text(a.name),
              onTap: () => Navigator.of(context).pop(a.id),
            ),
          ListTile(
            leading: Icon(current == null ? Icons.radio_button_checked : Icons.radio_button_unchecked),
            title: const Text('不指定（每次自己選）'),
            onTap: () => Navigator.of(context).pop(''),
          ),
        ],
      ),
    );
    if (picked == null) return;
    try {
      await ref
          .read(apiClientProvider)
          .setStockAccountId(spaceId: spaceId, accountId: picked.isEmpty ? null : picked);
      ref.invalidate(stockAccountIdProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
