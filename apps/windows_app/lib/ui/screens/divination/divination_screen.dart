import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/divination.dart';
import '../../../state/auth_provider.dart';
import '../../../state/divination_provider.dart';

/// 算命（梅花易數）— 輸入一次生辰，之後打想算的事就用「現在」起卦，
/// AI 依卦象與八字解卦。LINE / AI 問答說「我想算…」也會記到這裡。
class DivinationScreen extends ConsumerStatefulWidget {
  const DivinationScreen({super.key});

  @override
  ConsumerState<DivinationScreen> createState() => _DivinationScreenState();
}

class _DivinationScreenState extends ConsumerState<DivinationScreen> {
  final _questionController = TextEditingController();
  bool _casting = false;

  @override
  void dispose() {
    _questionController.dispose();
    super.dispose();
  }

  Future<void> _cast() async {
    final question = _questionController.text.trim();
    if (question.isEmpty || _casting) return;
    setState(() => _casting = true);
    try {
      final record = await ref.read(apiClientProvider).castDivination(question);
      _questionController.clear();
      ref.invalidate(divinationHistoryProvider);
      if (mounted) {
        await showDialog<void>(context: context, builder: (_) => _ReadingDialog(record: record));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _casting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(divinationHistoryProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('算命・梅花易數')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const _BirthCard(),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('想算什麼？', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    '按下「起卦」的這一刻就是起卦時間（年月日時起卦法）。',
                    style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _questionController,
                    decoration: const InputDecoration(hintText: '例如：這次換工作會順利嗎？'),
                    onSubmitted: (_) => _cast(),
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton.icon(
                      onPressed: _casting ? null : _cast,
                      icon: _casting
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.auto_awesome),
                      label: Text(_casting ? '解卦中…' : '起卦'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text('算過的卦', style: Theme.of(context).textTheme.titleMedium),
          if (historyAsync.value case final records? when records.any((r) => r.accuracy != null))
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                _accuracySummary(records),
                style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
              ),
            ),
          const SizedBox(height: 8),
          historyAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Text('讀取失敗：$error'),
            data: (records) => records.isEmpty
                ? Text('還沒有算過', style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)))
                : Column(
                    children: [
                      for (final record in records)
                        Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            title: Text(record.question),
                            subtitle: Text(
                              '${record.hexagram}　${record.castAt.year}/${record.castAt.month}/${record.castAt.day} '
                              '${record.castAt.hour.toString().padLeft(2, '0')}:${record.castAt.minute.toString().padLeft(2, '0')}',
                            ),
                            trailing: record.accuracy == null
                                ? const Icon(Icons.chevron_right)
                                : Chip(label: Text(divinationAccuracyLabel[record.accuracy]!), visualDensity: VisualDensity.compact),
                            onTap: () => showDialog<void>(context: context, builder: (_) => _ReadingDialog(record: record)),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _BirthCard extends ConsumerWidget {
  const _BirthCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(birthProfileProvider);
    final scheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: profileAsync.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) => Text('讀取失敗：$error'),
          data: (profile) => Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('我的生辰', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    if (profile.birthDate == null)
                      Text(
                        '還沒填。填了之後解卦會參考你的八字，更貼近你。',
                        style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
                      )
                    else ...[
                      Text('國曆 ${profile.birthDate}${profile.birthTime != null ? ' ${profile.birthTime}' : '（時間不詳）'}'),
                      if (profile.chart != null)
                        Text(
                          '農曆 ${profile.chart!.lunarBirthday}・生肖${profile.chart!.zodiac}\n'
                          '八字 ${profile.chart!.pillars}・日主 ${profile.chart!.dayMaster}',
                          style: TextStyle(fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.75)),
                        ),
                    ],
                  ],
                ),
              ),
              OutlinedButton(
                onPressed: () async {
                  final saved = await showDialog<bool>(context: context, builder: (_) => _BirthDialog(profile: profile));
                  if (saved == true) ref.invalidate(birthProfileProvider);
                },
                child: Text(profile.birthDate == null ? '填寫' : '修改'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BirthDialog extends ConsumerStatefulWidget {
  const _BirthDialog({required this.profile});

  final BirthProfile profile;

  @override
  ConsumerState<_BirthDialog> createState() => _BirthDialogState();
}

class _BirthDialogState extends ConsumerState<_BirthDialog> {
  late DateTime? _date = widget.profile.birthDate != null ? DateTime.parse(widget.profile.birthDate!) : null;
  late TimeOfDay? _time = _parseTime(widget.profile.birthTime);
  bool _saving = false;

  static TimeOfDay? _parseTime(String? value) {
    if (value == null) return null;
    final parts = value.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  String _two(int n) => n.toString().padLeft(2, '0');

  Future<void> _save() async {
    final date = _date;
    if (date == null) return;
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).setBirthProfile(
        birthDate: '${date.year}-${_two(date.month)}-${_two(date.day)}',
        birthTime: _time == null ? null : '${_two(_time!.hour)}:${_two(_time!.minute)}',
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
      title: const Text('我的生辰（國曆）'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OutlinedButton.icon(
            icon: const Icon(Icons.cake_outlined, size: 16),
            label: Text(_date == null ? '選擇出生日期' : '${_date!.year}/${_date!.month}/${_date!.day}'),
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _date ?? DateTime(1990, 1, 1),
                firstDate: DateTime(1900),
                lastDate: DateTime.now(),
                initialEntryMode: DatePickerEntryMode.input,
              );
              if (picked != null) setState(() => _date = picked);
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              OutlinedButton.icon(
                icon: const Icon(Icons.schedule, size: 16),
                label: Text(_time == null ? '出生時間（可不填）' : '${_two(_time!.hour)}:${_two(_time!.minute)}'),
                onPressed: () async {
                  final picked = await showTimePicker(context: context, initialTime: _time ?? const TimeOfDay(hour: 12, minute: 0));
                  if (picked != null) setState(() => _time = picked);
                },
              ),
              if (_time != null)
                IconButton(tooltip: '不知道時間', icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => _time = null)),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _saving || _date == null ? null : _save, child: const Text('儲存')),
      ],
    );
  }
}

String _accuracySummary(List<DivinationRecord> records) {
  final rated = records.where((r) => r.accuracy != null).toList();
  int count(int a) => rated.where((r) => r.accuracy == a).length;
  return '回饋過 ${rated.length} 次：準 ${count(3)}、部分準 ${count(2)}、不準 ${count(1)}（解卦會參考）';
}

class _ReadingDialog extends ConsumerStatefulWidget {
  const _ReadingDialog({required this.record});

  final DivinationRecord record;

  @override
  ConsumerState<_ReadingDialog> createState() => _ReadingDialogState();
}

class _ReadingDialogState extends ConsumerState<_ReadingDialog> {
  late int? _accuracy = widget.record.accuracy;
  late final _feedbackController = TextEditingController(text: widget.record.feedback ?? '');
  bool _saving = false;

  DivinationRecord get record => widget.record;

  @override
  void dispose() {
    _feedbackController.dispose();
    super.dispose();
  }

  Future<void> _saveFeedback() async {
    final accuracy = _accuracy;
    if (accuracy == null) return;
    setState(() => _saving = true);
    try {
      final text = _feedbackController.text.trim();
      await ref.read(apiClientProvider).setDivinationFeedback(record.id, accuracy, text.isEmpty ? null : text);
      ref.invalidate(divinationHistoryProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text('${record.hexagram}・${record.question}'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final line in record.summary)
                Text(line, style: TextStyle(fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.7))),
              const Divider(height: 24),
              SelectableText(record.interpretation),
              const Divider(height: 24),
              Text('後來準不準？', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final a in const [3, 2, 1])
                    ChoiceChip(
                      label: Text(divinationAccuracyLabel[a]!),
                      selected: _accuracy == a,
                      onSelected: (_) => setState(() => _accuracy = a),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _feedbackController,
                decoration: const InputDecoration(hintText: '實際發生了什麼？（可不填）'),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () async {
            await ref.read(apiClientProvider).deleteDivination(record.id);
            ref.invalidate(divinationHistoryProvider);
            if (context.mounted) Navigator.of(context).pop();
          },
          child: const Text('刪除'),
        ),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
        FilledButton(onPressed: _saving || _accuracy == null ? null : _saveFeedback, child: const Text('儲存回饋')),
      ],
    );
  }
}
