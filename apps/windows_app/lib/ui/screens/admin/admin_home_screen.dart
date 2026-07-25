import 'package:flutter/material.dart';

import 'admin_accounts_screen.dart';
import 'admin_project_options_screen.dart';
import 'admin_spaces_screen.dart';

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
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.apartment_outlined),
              title: const Text('空間管理'),
              subtitle: const Text('管理公司空間與成員權限'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const AdminSpacesScreen())),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.dashboard_customize_outlined),
              title: const Text('專案類型/狀態管理'),
              subtitle: const Text('設定所有專案共用的類型與狀態選項'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(
                context,
              ).push(MaterialPageRoute(builder: (_) => const AdminProjectOptionsScreen())),
            ),
          ),
        ],
      ),
    );
  }
}
