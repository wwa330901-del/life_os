import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/client.dart';
import '../../../state/auth_provider.dart';
import '../../../state/clients_provider.dart';

/// 客戶管理 — 掛在公司空間底下，該空間所有成員共用同一份清單，跟廠商管理
/// 同一個信任邊界慣例。基本資料：聯絡人/電話/Email/地址/備註。新建專案時
/// 強制從這裡選一個客戶（見 `CreateProjectDialog`）。
class ClientManagementScreen extends ConsumerWidget {
  const ClientManagementScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clientsAsync = ref.watch(clientsProvider(spaceId));

    return Scaffold(
      appBar: AppBar(title: const Text('客戶管理')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addOrEdit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增客戶'),
      ),
      body: clientsAsync.when(
        data: (clients) {
          if (clients.isEmpty) return const Center(child: Text('這個公司空間還沒有任何客戶，按右下角新增'));
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: clients.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final c = clients[index];
              return ListTile(
                title: Text(c.name),
                subtitle: Text(
                  [
                    if (c.contactPerson != null && c.contactPerson!.isNotEmpty) '聯絡人：${c.contactPerson}',
                    if (c.contactPhone != null && c.contactPhone!.isNotEmpty) c.contactPhone!,
                    if (c.contactEmail != null && c.contactEmail!.isNotEmpty) c.contactEmail!,
                  ].join('　'),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () => _addOrEdit(context, ref, client: c)),
                    IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete(context, ref, c)),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取客戶清單失敗：$error')),
      ),
    );
  }

  Future<void> _addOrEdit(BuildContext context, WidgetRef ref, {Client? client}) async {
    final nameController = TextEditingController(text: client?.name ?? '');
    final contactPersonController = TextEditingController(text: client?.contactPerson ?? '');
    final contactPhoneController = TextEditingController(text: client?.contactPhone ?? '');
    final contactEmailController = TextEditingController(text: client?.contactEmail ?? '');
    final addressController = TextEditingController(text: client?.address ?? '');
    final noteController = TextEditingController(text: client?.note ?? '');

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(client == null ? '新增客戶' : '編輯客戶'),
        content: SizedBox(
          width: 380,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameController, decoration: const InputDecoration(labelText: '客戶名稱')),
                TextField(controller: contactPersonController, decoration: const InputDecoration(labelText: '聯絡人')),
                TextField(controller: contactPhoneController, decoration: const InputDecoration(labelText: '聯絡電話')),
                TextField(controller: contactEmailController, decoration: const InputDecoration(labelText: 'Email')),
                TextField(controller: addressController, decoration: const InputDecoration(labelText: '地址')),
                TextField(controller: noteController, decoration: const InputDecoration(labelText: '備註（選填）')),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final name = nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入客戶名稱')));
      return;
    }

    try {
      final api = ref.read(apiClientProvider);
      if (client == null) {
        await api.createClient(
          spaceId: spaceId,
          name: name,
          contactPerson: contactPersonController.text.trim(),
          contactPhone: contactPhoneController.text.trim(),
          contactEmail: contactEmailController.text.trim(),
          address: addressController.text.trim(),
          note: noteController.text.trim(),
        );
      } else {
        await api.updateClient(
          spaceId: spaceId,
          clientId: client.id,
          name: name,
          contactPerson: contactPersonController.text.trim(),
          contactPhone: contactPhoneController.text.trim(),
          contactEmail: contactEmailController.text.trim(),
          address: addressController.text.trim(),
          note: noteController.text.trim(),
        );
      }
      ref.invalidate(clientsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Client client) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除客戶'),
        content: Text('確定要刪除「${client.name}」嗎？如果已經有專案連結這個客戶會刪除失敗。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteClient(spaceId, client.id);
      ref.invalidate(clientsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
