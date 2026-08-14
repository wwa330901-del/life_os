import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/api_client.dart';
import '../../../../../core/models/engineering_finance.dart';
import '../../../../../state/auth_provider.dart';
import '../../../../../state/engineering_finance_provider.dart';
import '../../../finance/widgets/finance_format.dart';

/// 廠商管理 — 掛在公司空間底下，該空間所有成員共用同一份清單。統編/聯絡人
/// /電話/地址/工種標籤/評選等級/特性/收款帳戶都在這裡維護，採發比價表選
/// 廠商、請款單自動帶收款資料都從這裡撈。
class VendorManagementScreen extends ConsumerWidget {
  const VendorManagementScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final vendorsAsync = ref.watch(vendorsProvider(spaceId));

    return Scaffold(
      appBar: AppBar(title: const Text('廠商管理')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addOrEdit(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增廠商'),
      ),
      body: vendorsAsync.when(
        data: (vendors) {
          if (vendors.isEmpty) return const Center(child: Text('這個公司空間還沒有任何廠商，按右下角新增'));
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: vendors.length,
            separatorBuilder: (_, _) => const Divider(),
            itemBuilder: (context, index) {
              final v = vendors[index];
              return ListTile(
                title: Text(v.name),
                subtitle: Text(
                  [
                    if (v.tradeCategory != null && v.tradeCategory!.isNotEmpty) v.tradeCategory!,
                    if (v.contactPerson != null && v.contactPerson!.isNotEmpty) '聯絡人：${v.contactPerson}',
                    if (v.contactPhone != null && v.contactPhone!.isNotEmpty) v.contactPhone!,
                  ].join('　'),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (v.rating != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Row(
                          children: [
                            for (var i = 0; i < 5; i++)
                              Icon(i < v.rating! ? Icons.star : Icons.star_border, size: 14, color: Colors.amber),
                          ],
                        ),
                      ),
                    IconButton(icon: const Icon(Icons.history), tooltip: '配合過案件', onPressed: () => _showHistory(context, ref, v)),
                    IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () => _addOrEdit(context, ref, vendor: v)),
                    IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete(context, ref, v)),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取廠商清單失敗：$error')),
      ),
    );
  }

  Future<void> _addOrEdit(BuildContext context, WidgetRef ref, {Vendor? vendor}) async {
    final nameController = TextEditingController(text: vendor?.name ?? '');
    final taxIdController = TextEditingController(text: vendor?.taxId ?? '');
    final contactPersonController = TextEditingController(text: vendor?.contactPerson ?? '');
    final contactPhoneController = TextEditingController(text: vendor?.contactPhone ?? '');
    final addressController = TextEditingController(text: vendor?.address ?? '');
    final tradeCategoryController = TextEditingController(text: vendor?.tradeCategory ?? '');
    final characteristicsController = TextEditingController(text: vendor?.characteristics ?? '');
    final bankAccountController = TextEditingController(text: vendor?.bankAccount ?? '');
    final accountHolderController = TextEditingController(text: vendor?.accountHolder ?? '');
    final bankBranchController = TextEditingController(text: vendor?.bankBranch ?? '');
    final noteController = TextEditingController(text: vendor?.note ?? '');
    int rating = vendor?.rating ?? 0;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(vendor == null ? '新增廠商' : '編輯廠商'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(controller: nameController, decoration: const InputDecoration(labelText: '廠商名稱')),
                  TextField(controller: taxIdController, decoration: const InputDecoration(labelText: '統一編號／稅籍資料')),
                  TextField(controller: tradeCategoryController, decoration: const InputDecoration(labelText: '廠商分類／工種標籤')),
                  Row(
                    children: [
                      const Text('評選等級：'),
                      for (var i = 1; i <= 5; i++)
                        IconButton(
                          icon: Icon(i <= rating ? Icons.star : Icons.star_border, color: Colors.amber),
                          onPressed: () => setState(() => rating = rating == i ? 0 : i),
                        ),
                    ],
                  ),
                  TextField(controller: characteristicsController, decoration: const InputDecoration(labelText: '廠商特性（選填）')),
                  const Divider(),
                  TextField(controller: contactPersonController, decoration: const InputDecoration(labelText: '聯絡人')),
                  TextField(controller: contactPhoneController, decoration: const InputDecoration(labelText: '聯絡電話')),
                  TextField(controller: addressController, decoration: const InputDecoration(labelText: '地址')),
                  const Divider(),
                  TextField(controller: bankAccountController, decoration: const InputDecoration(labelText: '收款帳號')),
                  TextField(controller: accountHolderController, decoration: const InputDecoration(labelText: '戶名')),
                  TextField(controller: bankBranchController, decoration: const InputDecoration(labelText: '銀行分行')),
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
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final name = nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請輸入廠商名稱')));
      return;
    }

    try {
      final api = ref.read(apiClientProvider);
      if (vendor == null) {
        await api.createVendor(
          spaceId: spaceId,
          name: name,
          taxId: taxIdController.text.trim(),
          contactPerson: contactPersonController.text.trim(),
          contactPhone: contactPhoneController.text.trim(),
          address: addressController.text.trim(),
          tradeCategory: tradeCategoryController.text.trim(),
          rating: rating == 0 ? null : rating,
          characteristics: characteristicsController.text.trim(),
          bankAccount: bankAccountController.text.trim(),
          accountHolder: accountHolderController.text.trim(),
          bankBranch: bankBranchController.text.trim(),
          note: noteController.text.trim(),
        );
      } else {
        await api.updateVendor(
          spaceId: spaceId,
          vendorId: vendor.id,
          name: name,
          taxId: taxIdController.text.trim(),
          contactPerson: contactPersonController.text.trim(),
          contactPhone: contactPhoneController.text.trim(),
          address: addressController.text.trim(),
          tradeCategory: tradeCategoryController.text.trim(),
          rating: rating == 0 ? null : rating,
          characteristics: characteristicsController.text.trim(),
          bankAccount: bankAccountController.text.trim(),
          accountHolder: accountHolderController.text.trim(),
          bankBranch: bankBranchController.text.trim(),
          note: noteController.text.trim(),
        );
      }
      ref.invalidate(vendorsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Vendor vendor) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除廠商'),
        content: Text('確定要刪除「${vendor.name}」嗎？如果這家廠商已經有比價紀錄會刪除失敗。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteVendor(spaceId, vendor.id);
      ref.invalidate(vendorsProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _showHistory(BuildContext context, WidgetRef ref, Vendor vendor) async {
    final history = await ref.read(apiClientProvider).vendorHistory(spaceId, vendor.id);
    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('「${vendor.name}」配合過的案件'),
        content: SizedBox(
          width: 420,
          height: 360,
          child: history.isEmpty
              ? const Center(child: Text('還沒有任何比價紀錄'))
              : ListView(
                  children: [
                    for (final h in history)
                      ListTile(
                        dense: true,
                        leading: h.wasSelected ? const Icon(Icons.check_circle, color: Colors.green, size: 18) : null,
                        title: Text('${h.projectName}　${h.scopeName}'),
                        subtitle: Text(
                          '報價 ${formatAmount(h.quotedAmount)}'
                          '${h.awardedAmount != null ? '　決標 ${formatAmount(h.awardedAmount!)}' : ''}',
                        ),
                      ),
                  ],
                ),
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
      ),
    );
  }
}
