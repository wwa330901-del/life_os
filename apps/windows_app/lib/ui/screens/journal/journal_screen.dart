import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/journal_entry.dart';
import '../../../state/auth_provider.dart';
import '../../../state/journal_provider.dart';

const _weekdays = ['一', '二', '三', '四', '五', '六', '日'];

/// 日記 — account-level. Entries come from here or from just talking to the
/// 萬用 AI in LINE / AI 問答 (it also guesses mood and tags).
class JournalScreen extends ConsumerStatefulWidget {
  const JournalScreen({super.key});

  @override
  ConsumerState<JournalScreen> createState() => _JournalScreenState();
}

class _JournalScreenState extends ConsumerState<JournalScreen> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(journalEntriesProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('日記'),
        actions: [
          SizedBox(
            width: 220,
            child: TextField(
              controller: _searchController,
              decoration: const InputDecoration(
                hintText: '搜尋內容或標籤',
                prefixIcon: Icon(Icons.search, size: 18),
                isDense: true,
              ),
              onSubmitted: (value) => ref.read(journalKeywordProvider.notifier).set(value),
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('寫日記'),
      ),
      body: entriesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取失敗：$error')),
        data: (entries) {
          if (entries.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  ref.read(journalKeywordProvider).isEmpty
                      ? '還沒有日記。\n按右下角「寫日記」，或直接在 LINE 跟元序助理說今天發生的事，它會幫你記下來。'
                      : '找不到符合的日記',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 96),
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              final showDate = index == 0 || entries[index - 1].date != entry.date;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (showDate)
                    Padding(
                      padding: const EdgeInsets.only(top: 16, bottom: 6),
                      child: Text(
                        '${entry.date.year}/${entry.date.month}/${entry.date.day}（${_weekdays[entry.date.weekday - 1]}）',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                  _EntryCard(entry: entry, onTap: () => _openEditor(context, entry: entry)),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _openEditor(BuildContext context, {JournalEntry? entry}) async {
    final changed = await showDialog<bool>(context: context, builder: (_) => _JournalEditorDialog(entry: entry));
    if (changed == true) ref.invalidate(journalEntriesProvider);
  }
}

class _EntryCard extends StatelessWidget {
  const _EntryCard({required this.entry, required this.onTap});

  final JournalEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(entry.mood != null ? journalMoodEmoji[entry.mood!] : '📝', style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.content),
                    if (entry.tags.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          for (final tag in entry.tags)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: scheme.primary.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text('#$tag', style: TextStyle(fontSize: 12, color: scheme.primary)),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _JournalEditorDialog extends ConsumerStatefulWidget {
  const _JournalEditorDialog({this.entry});

  final JournalEntry? entry;

  @override
  ConsumerState<_JournalEditorDialog> createState() => _JournalEditorDialogState();
}

class _JournalEditorDialogState extends ConsumerState<_JournalEditorDialog> {
  late final _contentController = TextEditingController(text: widget.entry?.content ?? '');
  late final _tagsController = TextEditingController(text: widget.entry?.tags.join(' ') ?? '');
  late DateTime _date = widget.entry?.date ?? DateTime.now();
  late int? _mood = widget.entry?.mood;
  bool _saving = false;

  @override
  void dispose() {
    _contentController.dispose();
    _tagsController.dispose();
    super.dispose();
  }

  List<String> get _tags =>
      _tagsController.text.split(RegExp(r'[\s,，、#]+')).where((t) => t.isNotEmpty).toList();

  Future<void> _save() async {
    final content = _contentController.text.trim();
    if (content.isEmpty) return;
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    try {
      final entry = widget.entry;
      if (entry == null) {
        await api.createJournalEntry(content: content, date: _date, mood: _mood, tags: _tags);
      } else {
        await api.updateJournalEntry(entry.id, content: content, date: _date, mood: _mood, tags: _tags);
      }
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete() async {
    final entry = widget.entry;
    if (entry == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除這則日記？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteJournalEntry(entry.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.entry == null ? '寫日記' : '編輯日記'),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            OutlinedButton.icon(
              icon: const Icon(Icons.event, size: 16),
              label: Text('${_date.year}/${_date.month}/${_date.day}'),
              onPressed: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime(2000),
                  lastDate: DateTime.now().add(const Duration(days: 1)),
                );
                if (picked != null) setState(() => _date = picked);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _contentController,
              autofocus: true,
              minLines: 4,
              maxLines: 10,
              decoration: const InputDecoration(labelText: '今天發生了什麼？', alignLabelWithHint: true),
            ),
            const SizedBox(height: 12),
            const Text('心情'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (var mood = 1; mood <= 5; mood++)
                  ChoiceChip(
                    label: Text('${journalMoodEmoji[mood]} ${journalMoodLabel[mood]}'),
                    selected: _mood == mood,
                    onSelected: (selected) => setState(() => _mood = selected ? mood : null),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _tagsController,
              decoration: const InputDecoration(labelText: '標籤（空格分開，例如：工作 家人）'),
            ),
          ],
        ),
      ),
      actions: [
        if (widget.entry != null)
          TextButton(onPressed: _saving ? null : _delete, child: const Text('刪除')),
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _saving ? null : _save, child: const Text('儲存')),
      ],
    );
  }
}
