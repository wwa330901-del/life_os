import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/contact_record.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/contact_records_provider.dart';

/// 聯絡單與會議記錄（2026-09）— 純 CRUD 隨手記錄，不是週期性繳交，沒有
/// reminder 催辦。列表可依類型篩選。
class ContactRecordsTab extends ConsumerStatefulWidget {
  const ContactRecordsTab({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<ContactRecordsTab> createState() => _ContactRecordsTabState();
}

class _ContactRecordsTabState extends ConsumerState<ContactRecordsTab> {
  ContactRecordType? _filter;

  @override
  Widget build(BuildContext context) {
    final recordsAsync = ref.watch(contactRecordsProvider(widget.projectId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _create(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增記錄'),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Wrap(
              spacing: 8,
              children: [
                ChoiceChip(label: const Text('全部'), selected: _filter == null, onSelected: (_) => setState(() => _filter = null)),
                for (final type in ContactRecordType.values)
                  ChoiceChip(
                    label: Text(type.label),
                    selected: _filter == type,
                    onSelected: (_) => setState(() => _filter = type),
                  ),
              ],
            ),
          ),
          Expanded(
            child: recordsAsync.when(
              data: (records) {
                final filtered = _filter == null ? records : records.where((r) => r.type == _filter).toList();
                if (filtered.isEmpty) return const Center(child: Text('目前沒有任何聯絡單/會議記錄，按右下角新增'));
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) => const Divider(),
                  itemBuilder: (context, index) {
                    final r = filtered[index];
                    return ListTile(
                      leading: Chip(label: Text(r.type.label), visualDensity: VisualDensity.compact),
                      title: Text(r.title),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${r.recordDate.year}/${r.recordDate.month}/${r.recordDate.day}'),
                          Text(r.content),
                          if (r.attendees != null && r.attendees!.isNotEmpty) Text('與會人員：${r.attendees}'),
                          Text(
                            '建立人：${r.createdByName}',
                            style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                      isThreeLine: true,
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => _delete(context, ref, r),
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取聯絡單/會議記錄失敗：$error')),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final titleController = TextEditingController();
    final contentController = TextEditingController();
    final attendeesController = TextEditingController();
    ContactRecordType type = ContactRecordType.contactSheet;
    DateTime recordDate = DateTime.now();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('新增聯絡單/會議記錄'),
          content: SizedBox(
            width: 380,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DropdownButtonFormField<ContactRecordType>(
                    initialValue: type,
                    decoration: const InputDecoration(labelText: '類型'),
                    items: [
                      for (final t in ContactRecordType.values) DropdownMenuItem(value: t, child: Text(t.label)),
                    ],
                    onChanged: (value) {
                      if (value != null) setState(() => type = value);
                    },
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: Text('日期：${recordDate.year}/${recordDate.month}/${recordDate.day}')),
                      TextButton(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: recordDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => recordDate = picked);
                        },
                        child: const Text('選擇日期'),
                      ),
                    ],
                  ),
                  TextField(controller: titleController, decoration: const InputDecoration(labelText: '標題')),
                  TextField(
                    controller: contentController,
                    decoration: const InputDecoration(labelText: '內容'),
                    maxLines: 4,
                  ),
                  TextField(
                    controller: attendeesController,
                    decoration: const InputDecoration(labelText: '與會人員（選填）'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('送出')),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final title = titleController.text.trim();
    final content = contentController.text.trim();
    if (title.isEmpty || content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('請填寫標題與內容')));
      return;
    }

    try {
      await ref
          .read(apiClientProvider)
          .createContactRecord(
            projectId: widget.projectId,
            type: type,
            recordDate: recordDate,
            title: title,
            content: content,
            attendees: attendeesController.text.trim(),
          );
      ref.invalidate(contactRecordsProvider(widget.projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, ContactRecord record) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除記錄'),
        content: Text('確定要刪除「${record.title}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteContactRecord(projectId: widget.projectId, recordId: record.id);
      ref.invalidate(contactRecordsProvider(widget.projectId));
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
