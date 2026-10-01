import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/health_record.dart';
import '../../../state/auth_provider.dart';
import '../../../state/health_provider.dart';

const _weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const _commonActivities = ['走路', '跑步', '重訓', '游泳', '騎車', '瑜珈', '球類'];

/// 健康 — account-level. Records come from here, from talking to the 萬用 AI
/// (「昨晚 12 點睡 7 點起」), or automatically from an iPhone 捷徑.
class HealthScreen extends ConsumerWidget {
  const HealthScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recordsAsync = ref.watch(healthRecordsProvider);
    final filter = ref.watch(healthTypeFilterProvider);
    final scheme = Theme.of(context).colorScheme;

    Future<void> openEditor({HealthRecord? record}) async {
      final all = ref.read(healthRecordsProvider).value ?? const [];
      final changed = await showDialog<bool>(
        context: context,
        builder: (_) => _HealthEditorDialog(record: record, initialType: filter ?? HealthType.sleep, history: all),
      );
      if (changed == true) {
        ref.invalidate(healthRecordsProvider);
        ref.invalidate(healthSummaryProvider);
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('健康'),
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.phone_iphone, size: 18),
            label: const Text('iPhone 自動記錄'),
            onPressed: () => showDialog<void>(context: context, builder: (_) => const _ShortcutSetupDialog()),
          ),
          const SizedBox(width: 16),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => openEditor(),
        icon: const Icon(Icons.add),
        label: const Text('記一筆'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 96),
        children: [
          const _SummaryRow(),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            children: [
              ChoiceChip(
                label: const Text('全部'),
                selected: filter == null,
                onSelected: (_) => ref.read(healthTypeFilterProvider.notifier).set(null),
              ),
              for (final type in HealthType.values)
                ChoiceChip(
                  label: Text('${type.emoji} ${type.label}'),
                  selected: filter == type,
                  onSelected: (_) => ref.read(healthTypeFilterProvider.notifier).set(type),
                ),
            ],
          ),
          ...recordsAsync.when(
            loading: () => [const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))],
            error: (error, _) => [Padding(padding: const EdgeInsets.all(32), child: Text('讀取失敗：$error'))],
            data: (records) {
              if (records.isEmpty) {
                return [
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      '還沒有紀錄。\n按右下角「記一筆」，或直接在 LINE 跟元序助理說「昨晚 12 點睡 7 點起」「今天跑步 30 分鐘」。\n想自動記錄睡眠，按右上角「iPhone 自動記錄」。',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
                    ),
                  ),
                ];
              }
              return [
                for (var i = 0; i < records.length; i++) ...[
                  if (i == 0 || records[i - 1].date != records[i].date)
                    Padding(
                      padding: const EdgeInsets.only(top: 16, bottom: 6),
                      child: Text(
                        '${records[i].date.year}/${records[i].date.month}/${records[i].date.day}（${_weekdays[records[i].date.weekday - 1]}）',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                  _RecordTile(record: records[i], onTap: () => openEditor(record: records[i])),
                ],
              ];
            },
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends ConsumerWidget {
  const _SummaryRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(healthSummaryProvider).value;
    final s = summary;
    String? change(double? c) => c == null || c == 0 ? null : '${c > 0 ? '+' : ''}${c.toStringAsFixed(1)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('最近 7 天', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            _StatTile(
              label: '平均睡眠',
              value: s?.sleepAverageMinutes != null ? formatHealthMinutes(s!.sleepAverageMinutes!) : '—',
              hint: s == null || s.sleepNights == 0 ? null : (s.shortNights > 0 ? '${s.shortNights} 晚不到 6 小時' : '記了 ${s.sleepNights} 晚'),
              warn: (s?.shortNights ?? 0) >= 3,
            ),
            _StatTile(
              label: '運動',
              value: s == null || s.exerciseSessions == 0 ? '—' : '${s.exerciseSessions} 次',
              hint: s != null && s.exerciseMinutes > 0 ? '共 ${s.exerciseMinutes} 分鐘' : null,
            ),
            _StatTile(
              label: '體重',
              value: s?.weightLast != null ? '${s!.weightLast!.toStringAsFixed(1)} 公斤' : '—',
              hint: change(s?.weightChange),
            ),
            _StatTile(
              label: '平均步數',
              value: s?.stepsAverage != null ? formatThousands(s!.stepsAverage!) : '—',
            ),
          ],
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, this.hint, this.warn = false});

  final String label;
  final String value;
  final String? hint;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 170,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6))),
              const SizedBox(height: 4),
              Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              if (hint != null) ...[
                const SizedBox(height: 2),
                Text(hint!, style: TextStyle(fontSize: 12, color: warn ? scheme.error : scheme.onSurface.withValues(alpha: 0.6))),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.onTap});

  final HealthRecord record;
  final VoidCallback onTap;

  String _clock(DateTime t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final details = [
      if (record.type == HealthType.sleep && record.startAt != null)
        '${_clock(record.startAt!)} 睡${record.endAt != null ? '、${_clock(record.endAt!)} 起' : ''}',
      if (record.note != null) record.note!,
      if (record.source == 'SHORTCUT') 'iPhone 自動',
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: Text(record.type.emoji, style: const TextStyle(fontSize: 22)),
        title: Text('${record.type.label}　${record.summary}'),
        subtitle: details.isEmpty
            ? null
            : Text(details.join(' · '), style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6))),
      ),
    );
  }
}

class _HealthEditorDialog extends ConsumerStatefulWidget {
  const _HealthEditorDialog({this.record, required this.initialType, required this.history});

  final HealthRecord? record;
  final HealthType initialType;

  /// Everything already loaded — used to prefill with what was entered last time.
  final List<HealthRecord> history;

  @override
  ConsumerState<_HealthEditorDialog> createState() => _HealthEditorDialogState();
}

class _HealthEditorDialogState extends ConsumerState<_HealthEditorDialog> {
  late HealthType _type = widget.record?.type ?? widget.initialType;
  late DateTime _date = widget.record?.date ?? DateTime.now();
  late TimeOfDay _bedtime;
  late TimeOfDay _wake;
  final _minutesController = TextEditingController();
  final _valueController = TextEditingController();
  final _activityController = TextEditingController();
  late final _noteController = TextEditingController(text: widget.record?.note ?? '');
  bool _saving = false;

  HealthRecord? _last(HealthType type) {
    for (final r in widget.history) {
      if (r.type == type && r.id != widget.record?.id) return r;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    final r = widget.record;
    final lastSleep = r?.type == HealthType.sleep ? r : _last(HealthType.sleep);
    _bedtime = lastSleep?.startAt != null ? TimeOfDay.fromDateTime(lastSleep!.startAt!) : const TimeOfDay(hour: 23, minute: 0);
    _wake = lastSleep?.endAt != null ? TimeOfDay.fromDateTime(lastSleep!.endAt!) : const TimeOfDay(hour: 7, minute: 0);
    if (r != null) {
      _activityController.text = r.activity ?? '';
      if (r.minutes != null && r.type == HealthType.exercise) _minutesController.text = '${r.minutes}';
      if (r.value != null) _valueController.text = r.type == HealthType.weight ? r.value!.toStringAsFixed(1) : '${r.value!.round()}';
    } else {
      _prefillFor(_type);
    }
  }

  /// 記住填過的：上次的運動項目/時間、上次的體重。
  void _prefillFor(HealthType type) {
    final last = _last(type);
    _activityController.text = type == HealthType.exercise ? (last?.activity ?? '') : '';
    _minutesController.text = type == HealthType.exercise && last?.minutes != null ? '${last!.minutes}' : '';
    _valueController.text = type == HealthType.weight && last?.value != null ? last!.value!.toStringAsFixed(1) : '';
  }

  @override
  void dispose() {
    _minutesController.dispose();
    _valueController.dispose();
    _activityController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  int get _sleepMinutes {
    final bed = _bedtime.hour * 60 + _bedtime.minute;
    final wake = _wake.hour * 60 + _wake.minute;
    return bed >= wake ? wake + 24 * 60 - bed : wake - bed;
  }

  List<String> get _activityChoices {
    final used = [for (final r in widget.history) if (r.type == HealthType.exercise && r.activity != null) r.activity!];
    return {...used, ..._commonActivities}.take(10).toList();
  }

  Future<void> _save() async {
    final api = ref.read(apiClientProvider);
    final note = _noteController.text.trim().isEmpty ? null : _noteController.text.trim();
    DateTime? startAt;
    DateTime? endAt;
    int? minutes;
    double? value;
    String? activity;
    switch (_type) {
      case HealthType.sleep:
        endAt = DateTime(_date.year, _date.month, _date.day, _wake.hour, _wake.minute);
        startAt = endAt.subtract(Duration(minutes: _sleepMinutes));
      case HealthType.exercise:
        activity = _activityController.text.trim().isEmpty ? null : _activityController.text.trim();
        minutes = int.tryParse(_minutesController.text.trim());
        if (activity == null && minutes == null) return _error('請填運動項目或時間');
      case HealthType.weight:
        value = double.tryParse(_valueController.text.trim());
        if (value == null) return _error('請填體重');
      case HealthType.steps:
        value = double.tryParse(_valueController.text.replaceAll(',', '').trim());
        if (value == null) return _error('請填步數');
    }
    setState(() => _saving = true);
    try {
      await api.saveHealthRecord(
        id: widget.record?.id,
        type: _type,
        date: _date,
        startAt: startAt,
        endAt: endAt,
        minutes: minutes,
        value: value,
        activity: activity,
        note: note,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        _error(e.message);
      }
    }
  }

  void _error(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<void> _delete() async {
    final record = widget.record;
    if (record == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除這筆紀錄？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(apiClientProvider).deleteHealthRecord(record.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _error(e.message);
    }
  }

  Widget _timeButton(String label, TimeOfDay time, ValueChanged<TimeOfDay> onPicked) {
    return OutlinedButton(
      onPressed: () async {
        final picked = await showTimePicker(context: context, initialTime: time);
        if (picked != null) onPicked(picked);
      },
      child: Text('$label ${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}'),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.record == null ? '記一筆' : '編輯${_type.label}'),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.record == null) ...[
              SegmentedButton<HealthType>(
                segments: [
                  for (final t in HealthType.values) ButtonSegment(value: t, label: Text('${t.emoji} ${t.label}')),
                ],
                selected: {_type},
                onSelectionChanged: (s) => setState(() {
                  _type = s.first;
                  _prefillFor(_type);
                }),
              ),
              const SizedBox(height: 16),
            ],
            OutlinedButton.icon(
              icon: const Icon(Icons.event, size: 16),
              label: Text('${_type == HealthType.sleep ? '起床那天 ' : ''}${_date.year}/${_date.month}/${_date.day}'),
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
            ...switch (_type) {
              HealthType.sleep => [
                Row(
                  children: [
                    _timeButton('幾點睡', _bedtime, (t) => setState(() => _bedtime = t)),
                    const SizedBox(width: 8),
                    _timeButton('幾點起', _wake, (t) => setState(() => _wake = t)),
                  ],
                ),
                const SizedBox(height: 8),
                Text('睡了 ${formatHealthMinutes(_sleepMinutes)}'),
              ],
              HealthType.exercise => [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final a in _activityChoices)
                      ChoiceChip(
                        label: Text(a),
                        selected: _activityController.text == a,
                        onSelected: (_) => setState(() => _activityController.text = a),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                TextField(controller: _activityController, decoration: const InputDecoration(labelText: '項目')),
                const SizedBox(height: 8),
                TextField(
                  controller: _minutesController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: '幾分鐘'),
                ),
              ],
              HealthType.weight => [
                TextField(
                  controller: _valueController,
                  autofocus: true,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: '體重（公斤）'),
                ),
              ],
              HealthType.steps => [
                TextField(
                  controller: _valueController,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: '步數'),
                ),
              ],
            },
            const SizedBox(height: 8),
            TextField(controller: _noteController, decoration: const InputDecoration(labelText: '備註（可不填）')),
          ],
        ),
      ),
      actions: [
        if (widget.record != null) TextButton(onPressed: _saving ? null : _delete, child: const Text('刪除')),
        TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _saving ? null : _save, child: const Text('儲存')),
      ],
    );
  }
}

/// The private upload URL + step-by-step iPhone 捷徑 setup.
class _ShortcutSetupDialog extends ConsumerStatefulWidget {
  const _ShortcutSetupDialog();

  @override
  ConsumerState<_ShortcutSetupDialog> createState() => _ShortcutSetupDialogState();
}

class _ShortcutSetupDialogState extends ConsumerState<_ShortcutSetupDialog> {
  String? _url;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool regenerate = false}) async {
    try {
      final url = await ref.read(apiClientProvider).getHealthIngestUrl(regenerate: regenerate);
      if (mounted) setState(() => _url = url);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _regenerate() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('重新產生網址？'),
        content: const Text('舊網址會立刻失效，iPhone 捷徑裡的網址要換成新的。網址不小心給別人看到時才需要這樣做。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('重新產生')),
        ],
      ),
    );
    if (confirmed == true) await _load(regenerate: true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final heading = Theme.of(context).textTheme.titleSmall;
    return AlertDialog(
      title: const Text('iPhone 自動記錄睡眠'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('用 iPhone 內建的「捷徑」App，睡覺和起床時自動把時間傳給元序，不用自己打。'),
              const SizedBox(height: 12),
              Text('你的專屬網址（不要給別人）', style: heading),
              const SizedBox(height: 6),
              if (_error != null)
                Text(_error!, style: TextStyle(color: scheme.error))
              else if (_url == null)
                const LinearProgressIndicator()
              else
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(child: SelectableText(_url!, style: const TextStyle(fontSize: 12))),
                      IconButton(
                        tooltip: '複製',
                        icon: const Icon(Icons.copy, size: 18),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: _url!));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已複製，可以用 LINE 傳給自己再貼到 iPhone')));
                        },
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              Text('方法一：睡覺、起床自動記（最簡單）', style: heading),
              const SizedBox(height: 6),
              const Text(
                '先在 iPhone「健康」App 設定好「睡眠」的就寢時間表。\n'
                '1. 打開「捷徑」App → 下方「自動化」→ 右上角「＋」→ 選「睡眠」→ 選「就寢時間開始」→ 選「立即執行」。\n'
                '2. 新增動作「取得 URL 的內容」，網址貼上上面的網址。\n'
                '3. 點「顯示更多」：方法選「POST」，要求本文選「JSON」，新增一個「文字」欄位：名稱打 event，內容打 sleep。\n'
                '4. 再建一個自動化，這次選「醒來」（起床），其他都一樣，只是內容打 wake。\n'
                '完成後，每天起床時元序就會自動記下昨晚睡了多久，早報也會告訴你。',
              ),
              const SizedBox(height: 16),
              Text('方法二：有 Apple Watch，記實際睡著的時間', style: heading),
              const SizedBox(height: 6),
              const Text(
                '1. 自動化 → 「＋」→ 選「特定時間」→ 每天早上 7:30（你平常起床後）→ 立即執行。\n'
                '2. 新增動作「尋找健康樣本」：類型選「睡眠分析」，條件「開始日期 在過去 1 天內」。\n'
                '3. 新增動作「取得 URL 的內容」，網址貼上上面的網址，方法 POST、要求本文 JSON，新增兩個「文字」欄位：\n'
                '　 sleepStart → 選變數「健康樣本」→ 點它選「開始日期」\n'
                '　 sleepEnd → 選變數「健康樣本」→ 點它選「結束日期」\n'
                '（也可以加 steps 步數、weight 體重。）',
              ),
              const SizedBox(height: 16),
              Text(
                '設好後可以先在捷徑裡按一次執行，看到「已記錄」或「晚安！」就成功了。不會設也沒關係，直接在 LINE 說「昨晚 12 點睡 7 點起」也可以。',
                style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.7)),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: _url == null ? null : _regenerate, child: const Text('重新產生網址')),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
      ],
    );
  }
}
