import 'package:flutter/material.dart';

import 'admin_accounts_screen.dart';
import 'admin_ai_usage_screen.dart';

class AdminHomeScreen extends StatelessWidget {
  const AdminHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('平台管理後台')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.people_outline),
              title: const Text('帳號管理'),
              subtitle: const Text('檢視平台上所有使用者'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const AdminAccountsScreen())),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.insights_outlined),
              title: const Text('AI 用量'),
              subtitle: const Text('所有使用者的 AI 使用次數、花費、失敗紀錄'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const AdminAiUsageScreen())),
            ),
          ),
        ],
      ),
    );
  }
}
