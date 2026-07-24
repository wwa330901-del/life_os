import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/admin_provider.dart';

class AdminAccountsScreen extends ConsumerWidget {
  const AdminAccountsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usersAsync = ref.watch(adminUsersProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('帳號管理')),
      body: usersAsync.when(
        data: (users) {
          if (users.isEmpty) {
            return const Center(child: Text('目前沒有任何帳號'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: users.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final user = users[index];
              return Card(
                child: ListTile(
                  leading: Icon(
                    user.isPlatformAdmin ? Icons.shield : Icons.person_outline,
                  ),
                  title: Text('${user.name}（@${user.username}）'),
                  subtitle: Text(
                    [
                      user.email,
                      user.emailVerified ? '已驗證' : '未驗證',
                      if (user.hasGoogleLogin) 'Google 登入',
                      if (user.isPlatformAdmin) '平台管理員',
                    ].join(' · '),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取失敗：$error')),
      ),
    );
  }
}
