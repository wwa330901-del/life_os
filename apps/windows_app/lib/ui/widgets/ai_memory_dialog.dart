import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models/memory.dart';
import '../../state/auth_provider.dart';
import '../../state/memory_provider.dart';

/// 「AI 記得的事」：AI 記住的事＋重要日子。平常靠跟 AI 講（「記住我不吃牛」
/// 「媽媽生日是農曆 9/1」），這裡可以看、改、刪、補。
class AiMemoryDialog extends StatelessWidget {
  const AiMemoryDialog({super.key});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: SizedBox(
        width: 560,
        height: 600,
        child: DefaultTabController(
          length: 2,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 8, 0),
                child: Row(
                  children: [
                    Text('AI 記得的事', style: Theme.of(context).textTheme.titleLarge),
                    const Spacer(),
                    IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
                  ],
                ),
              ),
              const TabBar(tabs: [Tab(text: '關於你'), Tab(text: '重要日子')]),
              const Expanded(child: TabBarView(children: [_MemoriesTab(), _DatesTab()])),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action, void Function(ProviderContainer) refresh) async {
  final container = ProviderScope.containerOf(context, listen: false);
  try {
    await action();
    refresh(container);
  } on ApiException catch (e) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
  }
}

class _MemoriesTab extends ConsumerWidget {
  const _MemoriesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(memoriesProvider);
    final hint = Theme.of(context).textTheme.bodySmall;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
          child: Text('跟 AI 聊天時講到你的喜好、家人、工作，它會自己記下來，之後給建議會參考。', style: hint),
        ),
        Expanded(
          child: async.when(
            data: (items) => items.isEmpty
                ? const Center(child: Text('還沒有記住任何事\n可以在 LINE 跟 AI 說「記住我不吃牛肉」', textAlign: TextAlign.center))
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final m = items[i];
                      return ListTile(
                        title: Text(m.content),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              tooltip: '修改',
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              onPressed: () => _edit(context, ref, m),
                            ),
                            IconButton(
                              tooltip: '忘掉',
                              icon: const Icon(Icons.delete_outline, size: 18),
                              onPressed: () => _run(context, ref, () => ref.read(apiClientProvider).deleteMemory(m.id), (c) => c.invalidate(memoriesProvider)),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('讀取失敗：$e')),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(onPressed: () => _edit(context, ref, null), icon: const Icon(Icons.add), label: const Text('新增')),
          ),
        ),
      ],
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, UserMemory? existing) async {
    final controller = TextEditingController(text: existing?.content ?? '');
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(existing == null ? '要 AI 記住什麼？' : '修改'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: '例如：不吃牛肉、太太喜歡多肉植物'),
          onSubmitted: (v) => Navigator.of(context).pop(v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('儲存')),
        ],
      ),
    );
    final content = text?.trim() ?? '';
    if (content.isEmpty || !context.mounted) return;
    final api = ref.read(apiClientProvider);
    await _run(
      context,
      ref,
      () => existing == null ? api.addMemory(content) : api.updateMemory(existing.id, content),
      (c) => c.invalidate(memoriesProvider),
    );
  }
}

class _DatesTab extends ConsumerWidget {
  const _DatesTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(importantDatesProvider);
    final hint = Theme.of(context).textTheme.bodySmall;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
          child: Text('生日、紀念日每年都會在前 7 天、前 1 天、當天用 LINE 提醒你，可以設農曆。', style: hint),
        ),
        Expanded(
          child: async.when(
            data: (items) => items.isEmpty
                ? const Center(child: Text('還沒有重要日子\n可以在 LINE 跟 AI 說「媽媽生日是農曆 9 月 1 號」', textAlign: TextAlign.center))
                : ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final d = items[i];
                      final next = d.nextDate.split('-');
                      final when = d.daysLeft == 0 ? '今天' : '${d.daysLeft} 天後';
                      final years = d.years != null && d.years! > 0 ? '・${d.title.contains('生日') ? '滿 ${d.years} 歲' : '第 ${d.years} 週年'}' : '';
                      return ListTile(
                        leading: CircleAvatar(child: Text(d.daysLeft <= 7 ? '🎉' : '📅')),
                        title: Text(d.title),
                        subtitle: Text(
                          '${d.dateLabel}・下次 ${int.parse(next[1])}/${int.parse(next[2])}（$when）$years${d.note != null ? '\n${d.note}' : ''}',
                        ),
                        isThreeLine: d.note != null,
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              tooltip: '修改',
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              onPressed: () => _edit(context, ref, d),
                            ),
                            IconButton(
                              tooltip: '刪除',
                              icon: const Icon(Icons.delete_outline, size: 18),
                              onPressed: () => _run(
                                context,
                                ref,
                                () => ref.read(apiClientProvider).deleteImportantDate(d.id),
                                (c) => c.invalidate(importantDatesProvider),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('讀取失敗：$e')),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(onPressed: () => _edit(context, ref, null), icon: const Icon(Icons.add), label: const Text('新增')),
          ),
        ),
      ],
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, ImportantDate? existing) async {
    final saved = await showDialog<bool>(context: context, builder: (_) => _DateEditor(existing: existing));
    if (saved == true && context.mounted) ref.invalidate(importantDatesProvider);
  }
}

class _DateEditor extends ConsumerStatefulWidget {
  const _DateEditor({this.existing});

  final ImportantDate? existing;

  @override
  ConsumerState<_DateEditor> createState() => _DateEditorState();
}

class _DateEditorState extends ConsumerState<_DateEditor> {
  late final _title = TextEditingController(text: widget.existing?.title ?? '');
  late final _year = TextEditingController(text: widget.existing?.year?.toString() ?? '');
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  late int _month = widget.existing?.month ?? 1;
  late int _day = widget.existing?.day ?? 1;
  late bool _isLunar = widget.existing?.isLunar ?? false;
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _year.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).saveImportantDate(
        id: widget.existing?.id,
        title: title,
        month: _month,
        day: _day,
        year: int.tryParse(_year.text.trim()),
        isLunar: _isLunar,
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? '新增重要日子' : '修改重要日子'),
      content: SizedBox(
        width: 380,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _title,
              autofocus: true,
              decoration: const InputDecoration(labelText: '名稱', hintText: '例如：媽媽生日、結婚紀念日'),
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: false, label: Text('國曆')), ButtonSegment(value: true, label: Text('農曆'))],
              selected: {_isLunar},
              onSelectionChanged: (s) => setState(() {
                _isLunar = s.first;
                if (_isLunar && _day > 30) _day = 30;
              }),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _month,
                    decoration: const InputDecoration(labelText: '月'),
                    items: [for (var m = 1; m <= 12; m++) DropdownMenuItem(value: m, child: Text('$m 月'))],
                    onChanged: (v) => setState(() => _month = v ?? _month),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _day,
                    decoration: const InputDecoration(labelText: '日'),
                    items: [for (var d = 1; d <= (_isLunar ? 30 : 31); d++) DropdownMenuItem(value: d, child: Text('$d 日'))],
                    onChanged: (v) => setState(() => _day = v ?? _day),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _year,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '出生／開始年份（可不填，填了會算幾歲、第幾週年）'),
            ),
            const SizedBox(height: 12),
            TextField(controller: _note, decoration: const InputDecoration(labelText: '備註（可不填，例如喜歡什麼）')),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
        FilledButton(onPressed: _saving ? null : _save, child: const Text('儲存')),
      ],
    );
  }
}
