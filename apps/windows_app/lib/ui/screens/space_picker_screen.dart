import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';

class SpacePickerScreen extends ConsumerWidget {
  const SpacePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spacesAsync = ref.watch(mySpacesProvider);
    final session = ref.watch(authControllerProvider).value;

    return Scaffold(
      appBar: AppBar(
        title: Text(session != null ? '你好，${session.user.name}' : '選擇空間'),
        actions: [
          IconButton(
            tooltip: '登出',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: spacesAsync.when(
        data: (spaces) {
          if (spaces.isEmpty) {
            return const Center(child: Text('目前沒有可以使用的空間'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            itemCount: spaces.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final space = spaces[index];
              return Card(
                child: ListTile(
                  leading: Icon(
                    space.type == SpaceType.personal ? Icons.person : Icons.apartment,
                  ),
                  title: Text(space.name),
                  subtitle: Text(space.type == SpaceType.personal ? '個人空間' : '公司空間 · ${space.role}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => ref.read(selectedSpaceProvider.notifier).select(space),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取空間失敗：$error')),
      ),
    );
  }
}
