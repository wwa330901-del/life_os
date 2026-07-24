import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/app_user.dart';
import '../../../state/admin_provider.dart';
import '../../../state/auth_provider.dart';
import 'admin_space_detail_screen.dart';

class AdminSpacesScreen extends ConsumerWidget {
  const AdminSpacesScreen({super.key});

  Future<void> _createSpace(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新增公司空間'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: '空間名稱'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('建立'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).adminCreateSpace(name);
      ref.invalidate(adminSpacesProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spacesAsync = ref.watch(adminSpacesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('空間管理')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createSpace(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增公司空間'),
      ),
      body: spacesAsync.when(
        data: (spaces) {
          if (spaces.isEmpty) {
            return const Center(child: Text('目前沒有任何空間'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: spaces.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final space = spaces[index];
              final isCompany = space.type == SpaceType.company;
              return Card(
                child: ListTile(
                  leading: Icon(isCompany ? Icons.apartment : Icons.person),
                  title: Text(space.name),
                  subtitle: Text(
                    isCompany ? '公司空間 · ${space.memberCount} 位成員' : '個人空間 · ${space.personalOwnerName}',
                  ),
                  trailing: isCompany ? const Icon(Icons.chevron_right) : null,
                  onTap: isCompany
                      ? () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => AdminSpaceDetailScreen(spaceId: space.id, spaceName: space.name),
                          ),
                        )
                      : null,
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
