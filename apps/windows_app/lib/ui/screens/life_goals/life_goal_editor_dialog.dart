import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/life_goal.dart';
import '../../../state/auth_provider.dart';
import '../../../state/life_goal_provider.dart';

/// How the editor presents 追蹤方式 — [LifeGoalTrackingType] plus 「不追蹤數字」,
/// which is stored as MANUAL with no target.
enum _Mode { none, manual, accountBalance, netWorth, noteKeywordSum, stockValue, checkIn }

extension on _Mode {
  String get label => switch (this) {
    _Mode.none => '不追蹤數字（只看期限）',
    _Mode.manual => '手動更新數字',
    _Mode.accountBalance => '自動：指定帳戶的餘額',
    _Mode.netWorth => '自動：淨資產',
    _Mode.noteKeywordSum => '自動：記帳備註含關鍵字的存款',
    _Mode.stockValue => '自動：持股市值',
    _Mode.checkIn => '打卡次數（讀書、運動…）',
  };

  LifeGoalTrackingType get trackingType => switch (this) {
    _Mode.none || _Mode.manual => LifeGoalTrackingType.manual,
    _Mode.accountBalance => LifeGoalTrackingType.accountBalance,
    _Mode.netWorth => LifeGoalTrackingType.netWorth,
    _Mode.noteKeywordSum => LifeGoalTrackingType.noteKeywordSum,
    _Mode.stockValue => LifeGoalTrackingType.stockValue,
    _Mode.checkIn => LifeGoalTrackingType.checkIn,
  };

  bool get needsTarget =>
      this == _Mode.manual ||
      this == _Mode.accountBalance ||
      this == _Mode.netWorth ||
      this == _Mode.noteKeywordSum ||
      this == _Mode.stockValue;
}

_Mode _modeOf(LifeGoal goal) => switch (goal.trackingType) {
  LifeGoalTrackingType.manual => goal.targetValue == null ? _Mode.none : _Mode.manual,
  LifeGoalTrackingType.accountBalance => _Mode.accountBalance,
  LifeGoalTrackingType.netWorth => _Mode.netWorth,
  LifeGoalTrackingType.noteKeywordSum => _Mode.noteKeywordSum,
  LifeGoalTrackingType.stockValue => _Mode.stockValue,
  LifeGoalTrackingType.checkIn => _Mode.checkIn,
};

class _Template {
  const _Template({
    required this.label,
    required this.title,
    required this.category,
    required this.mode,
    this.unit,
    this.target,
    this.period = LifeGoalPeriod.total,
    this.requireNote = false,
  });

  final String label;
  final String title;
  final String category;
  final _Mode mode;
  final String? unit;
  final double? target;
  final LifeGoalPeriod period;
  final bool requireNote;
}

const _templates = [
  _Template(label: '💰 存到一筆錢', title: '存到 15 萬', category: '財務', mode: _Mode.accountBalance, unit: '元', target: 150000),
  _Template(label: '🏝️ 存專款（看記帳備註）', title: '存旅遊基金', category: '財務', mode: _Mode.noteKeywordSum, unit: '元', target: 50000),
  _Template(label: '📈 淨資產達標', title: '淨資產達到 100 萬', category: '財務', mode: _Mode.netWorth, unit: '元', target: 1000000),
  _Template(label: '📊 投資市值達標', title: '投資市值達到 50 萬', category: '財務', mode: _Mode.stockValue, unit: '元', target: 500000),
  _Template(label: '📚 讀書', title: '一年讀 12 本書', category: '學習', mode: _Mode.checkIn, unit: '本', target: 12, requireNote: true),
  _Template(label: '🏃 每週運動', title: '每週運動 3 次', category: '健康', mode: _Mode.checkIn, unit: '次', target: 3, period: LifeGoalPeriod.weekly),
  _Template(label: '⚖️ 體重', title: '體重降到 70 公斤', category: '健康', mode: _Mode.manual, unit: '公斤', target: 70),
  _Template(label: '🌱 不用數字的目標', title: '', category: '生活', mode: _Mode.none),
];

const lifeGoalPresetCategories = ['財務', '健康', '學習', '工作', '人際', '生活'];

/// Opens the 新增／編輯目標 dialog. [allGoals] (including ended ones) feeds
/// the 「以前填過的」 suggestions and the category chips, so anything typed
/// once never has to be typed again.
Future<LifeGoalInput?> showLifeGoalEditor(
  BuildContext context, {
  LifeGoal? existing,
  required List<LifeGoal> allGoals,
}) {
  return showDialog<LifeGoalInput>(
    context: context,
    builder: (_) => _LifeGoalEditorDialog(existing: existing, allGoals: allGoals),
  );
}

class _LifeGoalEditorDialog extends ConsumerStatefulWidget {
  const _LifeGoalEditorDialog({required this.existing, required this.allGoals});

  final LifeGoal? existing;
  final List<LifeGoal> allGoals;

  @override
  ConsumerState<_LifeGoalEditorDialog> createState() => _LifeGoalEditorDialogState();
}

class _LifeGoalEditorDialogState extends ConsumerState<_LifeGoalEditorDialog> {
  late final _title = TextEditingController(text: widget.existing?.title ?? '');
  late final _notes = TextEditingController(text: widget.existing?.notes ?? '');
  late final _customCategory = TextEditingController();
  late final _target = TextEditingController(text: _numText(widget.existing?.targetValue));
  late final _current = TextEditingController(
    text: widget.existing?.trackingType == LifeGoalTrackingType.manual ? _numText(widget.existing?.currentValue) : '',
  );
  late final _start = TextEditingController(
    text: widget.existing?.trackingType == LifeGoalTrackingType.manual ? _numText(widget.existing?.startValue) : '',
  );
  late final _unit = TextEditingController(text: widget.existing?.unit ?? '');
  late final _keyword = TextEditingController(text: widget.existing?.trackingKeyword ?? '');

  late String? _category = widget.existing?.category;
  var _customCategoryMode = false;
  late _Mode _mode = widget.existing == null ? _Mode.manual : _modeOf(widget.existing!);
  late String? _accountId = widget.existing?.trackingAccountId;
  late LifeGoalPeriod _period = widget.existing?.checkInPeriod ?? LifeGoalPeriod.total;
  late bool _requireNote = widget.existing?.requireCheckInNote ?? false;
  late DateTime? _targetDate = widget.existing?.targetDate;

  static String _numText(double? v) => v == null ? '' : formatGoalNumber(v).replaceAll(',', '');

  @override
  void dispose() {
    for (final c in [_title, _notes, _customCategory, _target, _current, _start, _unit, _keyword]) {
      c.dispose();
    }
    super.dispose();
  }

  List<String> get _categories {
    final used = widget.allGoals.map((g) => g.category).whereType<String>();
    return {...lifeGoalPresetCategories, ...used, ?_category}.toList();
  }

  /// Distinct past titles, newest-edited first isn't tracked, so list order.
  List<LifeGoal> get _history {
    final seen = <String>{};
    return [
      for (final g in widget.allGoals)
        if (g.id != widget.existing?.id && seen.add(g.title)) g,
    ].take(8).toList();
  }

  void _applyTemplate(_Template t) {
    setState(() {
      _title.text = t.title;
      _category = t.category;
      _customCategoryMode = false;
      _mode = t.mode;
      _unit.text = t.unit ?? '';
      _target.text = _numText(t.target);
      _current.text = '';
      _start.text = '';
      _period = t.period;
      _requireNote = t.requireNote;
    });
  }

  void _applyHistory(LifeGoal g) {
    setState(() {
      _title.text = g.title;
      _category = g.category;
      _customCategoryMode = false;
      _mode = _modeOf(g);
      _unit.text = g.unit ?? '';
      _target.text = _numText(g.targetValue);
      _accountId = g.trackingAccountId;
      _keyword.text = g.trackingKeyword ?? '';
      _period = g.checkInPeriod;
      _requireNote = g.requireCheckInNote;
    });
  }

  bool _planning = false;
  Map<String, dynamic>? _plan;

  /// AI 幫我規劃：用目標欄寫的願望（加上備註）產生具體規劃，填進表單；
  /// 可行性、里程碑、每週行動放進備註，建立後一直看得到。
  Future<void> _aiPlan() async {
    final wish = _title.text.trim();
    if (wish.isEmpty) return;
    setState(() => _planning = true);
    try {
      final api = ref.read(apiClientProvider);
      final plan = await api.planLifeGoal(title: wish, notes: _notes.text.trim().isEmpty ? null : _notes.text.trim());
      final accounts = await ref.read(lifeGoalTrackingOptionsProvider.future);
      if (!mounted) return;
      final type = LifeGoalTrackingTypeJson.fromJson(plan['trackingType'] as String?);
      final target = (plan['targetValue'] as num?)?.toDouble();
      final accountName = plan['trackingAccountName'] as String?;
      final category = plan['category'] as String?;
      final milestones = (plan['milestones'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
      final actions = (plan['weeklyActions'] as List<dynamic>? ?? const []).cast<String>();
      setState(() {
        _plan = plan;
        _title.text = plan['title'] as String? ?? wish;
        if (category != null) {
          if (_categories.contains(category)) {
            _customCategoryMode = false;
            _category = category;
          } else {
            _customCategoryMode = true;
            _customCategory.text = category;
          }
        }
        _mode = switch (type) {
          LifeGoalTrackingType.manual => target == null ? _Mode.none : _Mode.manual,
          LifeGoalTrackingType.accountBalance => _Mode.accountBalance,
          LifeGoalTrackingType.netWorth => _Mode.netWorth,
          LifeGoalTrackingType.noteKeywordSum => _Mode.noteKeywordSum,
          LifeGoalTrackingType.stockValue => _Mode.stockValue,
          LifeGoalTrackingType.checkIn => _Mode.checkIn,
        };
        _target.text = _numText(target);
        _unit.text = plan['unit'] as String? ?? '';
        final date = plan['targetDate'] as String?;
        if (date != null) _targetDate = DateTime.parse(date);
        _period = LifeGoalPeriodJson.fromJson(plan['checkInPeriod'] as String?);
        _requireNote = plan['requireCheckInNote'] == true;
        _keyword.text = plan['trackingKeyword'] as String? ?? '';
        if (accountName != null) {
          _accountId = accounts.where((a) => a.name == accountName).map((a) => a.id).firstOrNull ?? _accountId;
        }
        _notes.text = [
          plan['feasibility'] as String? ?? '',
          if (milestones.isNotEmpty) '里程碑：${milestones.map((m) => '${(m['date'] as String).substring(5).replaceAll('-', '/')} ${m['text']}').join('；')}',
          if (actions.isNotEmpty) '每週：${actions.join('；')}',
        ].where((s) => s.isNotEmpty).join('\n');
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _planning = false);
    }
  }

  double? get _targetValue => double.tryParse(_target.text.trim());

  String? get _error {
    if (_title.text.trim().isEmpty) return '請輸入目標';
    if (_mode.needsTarget && (_targetValue ?? 0) <= 0) return '請輸入大於 0 的目標數值';
    if (_mode == _Mode.checkIn && _target.text.trim().isNotEmpty && (_targetValue ?? 0) <= 0) {
      return '目標次數要大於 0';
    }
    if (_mode == _Mode.manual && _current.text.trim().isNotEmpty && double.tryParse(_current.text.trim()) == null) {
      return '目前數值請輸入數字';
    }
    if (_mode == _Mode.manual && _start.text.trim().isNotEmpty && double.tryParse(_start.text.trim()) == null) {
      return '起始值請輸入數字';
    }
    if (_mode == _Mode.accountBalance && _accountId == null) return '請選擇要追蹤的帳戶';
    if (_mode == _Mode.noteKeywordSum && _keyword.text.trim().isEmpty) return '請輸入備註關鍵字';
    return null;
  }

  void _save() {
    String? trimmed(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final category = _customCategoryMode ? trimmed(_customCategory) : _category;
    final hasNumber = _mode != _Mode.none;

    Navigator.of(context).pop(
      LifeGoalInput(
        title: _title.text.trim(),
        notes: trimmed(_notes),
        category: category,
        targetValue: hasNumber ? _targetValue : null,
        currentValue: _mode == _Mode.manual ? (double.tryParse(_current.text.trim()) ?? 0) : null,
        // 空白＝從「目前」開始算（新增時最常見），存錢這種從 0 開始的也對。
        startValue: _mode == _Mode.manual
            ? (double.tryParse(_start.text.trim()) ?? double.tryParse(_current.text.trim()) ?? 0)
            : null,
        unit: hasNumber ? trimmed(_unit) : null,
        targetDate: _targetDate,
        trackingType: _mode.trackingType,
        trackingAccountId: _mode == _Mode.accountBalance ? _accountId : null,
        trackingKeyword: _mode == _Mode.noteKeywordSum ? trimmed(_keyword) : null,
        checkInPeriod: _period,
        requireCheckInNote: _mode == _Mode.checkIn && _requireNote,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final isNew = widget.existing == null;
    final error = _error;
    final history = _history;

    Widget sectionLabel(String text) => Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 6),
      child: Text(text, style: textTheme.labelLarge),
    );

    return AlertDialog(
      title: Text(isNew ? '新增目標' : '編輯目標'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isNew) ...[
                Text('從範本開始（點一下自動填好）', style: textTheme.labelLarge),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final t in _templates) ActionChip(label: Text(t.label), onPressed: () => _applyTemplate(t)),
                  ],
                ),
                if (history.isNotEmpty) ...[
                  sectionLabel('以前填過的'),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final g in history)
                        ActionChip(
                          avatar: const Icon(Icons.history, size: 16),
                          label: Text(g.title),
                          onPressed: () => _applyHistory(g),
                        ),
                    ],
                  ),
                ],
                const Divider(height: 28),
              ],
              TextField(
                controller: _title,
                autofocus: !isNew,
                decoration: const InputDecoration(labelText: '目標', hintText: '例如：年底前存到 15 萬、想開始運動'),
                onChanged: (_) => setState(() {}),
              ),
              if (isNew) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: _planning || _title.text.trim().isEmpty ? null : _aiPlan,
                      icon: _planning
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.auto_awesome_outlined, size: 18),
                      label: Text(_planning ? 'AI 規劃中…' : 'AI 幫我規劃'),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '寫下想達成什麼，AI 幫你訂數字、期限、追蹤方式和每週行動，存錢目標會用你的收支算每月要存多少',
                        style: textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
                if (_plan != null) ...[
                  const SizedBox(height: 8),
                  Card(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (_plan!['monthlyNeeded'] != null)
                            Text(
                              '每月要存：${formatGoalNumber((_plan!['monthlyNeeded'] as num).toDouble())} 元',
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          Text(_plan!['feasibility'] as String? ?? ''),
                          const SizedBox(height: 4),
                          Text('已經幫你填好下面的欄位，里程碑和每週行動放在備註，可以再改。', style: textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
              sectionLabel('分類'),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final c in _categories)
                    ChoiceChip(
                      label: Text(c),
                      selected: !_customCategoryMode && _category == c,
                      onSelected: (selected) => setState(() {
                        _customCategoryMode = false;
                        _category = selected ? c : null;
                      }),
                    ),
                  ChoiceChip(
                    label: const Text('＋自訂'),
                    selected: _customCategoryMode,
                    onSelected: (selected) => setState(() => _customCategoryMode = selected),
                  ),
                ],
              ),
              if (_customCategoryMode)
                TextField(
                  controller: _customCategory,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: '自訂分類名稱'),
                ),
              sectionLabel('怎麼追蹤進度'),
              DropdownButtonFormField<_Mode>(
                initialValue: _mode,
                isExpanded: true,
                items: [for (final m in _Mode.values) DropdownMenuItem(value: m, child: Text(m.label))],
                onChanged: (m) => setState(() {
                  _mode = m ?? _mode;
                  if (_mode == _Mode.checkIn && _unit.text.isEmpty) _unit.text = '次';
                  if ((_mode == _Mode.accountBalance ||
                          _mode == _Mode.netWorth ||
                          _mode == _Mode.noteKeywordSum ||
                          _mode == _Mode.stockValue) &&
                      _unit.text.isEmpty) {
                    _unit.text = '元';
                  }
                }),
              ),
              ..._trackingFields(),
              sectionLabel('期限（選填）'),
              InkWell(
                onTap: () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _targetDate ?? DateTime(now.year, 12, 31),
                    firstDate: DateTime(2000),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setState(() => _targetDate = picked);
                },
                child: InputDecorator(
                  decoration: InputDecoration(
                    suffixIcon: _targetDate == null
                        ? const Icon(Icons.calendar_today_outlined, size: 18)
                        : IconButton(
                            tooltip: '清除期限',
                            icon: const Icon(Icons.close, size: 18),
                            onPressed: () => setState(() => _targetDate = null),
                          ),
                  ),
                  child: Text(
                    _targetDate == null
                        ? '未設定（快到期時 LINE 會提醒你）'
                        : '${_targetDate!.year}/${_targetDate!.month}/${_targetDate!.day}',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notes,
                minLines: 1,
                maxLines: 4,
                decoration: const InputDecoration(labelText: '為什麼想達成？（選填）'),
              ),
            ],
          ),
        ),
      ),
      actions: [
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
          ),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: error == null ? _save : null, child: const Text('儲存')),
      ],
    );
  }

  List<Widget> _trackingFields() {
    Widget numberField(TextEditingController c, String label) => TextField(
      controller: c,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: label),
      onChanged: (_) => setState(() {}),
    );
    Widget unitField() => SizedBox(
      width: 80,
      child: TextField(controller: _unit, decoration: const InputDecoration(labelText: '單位')),
    );
    Widget hint(String text) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    );

    switch (_mode) {
      case _Mode.none:
        return [hint('適合「學會放鬆」這種不好量化的目標，只追蹤期限跟完成與否。')];
      case _Mode.manual:
        return [
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: numberField(_current, '目前')),
              const SizedBox(width: 12),
              Expanded(child: numberField(_target, '目標數值')),
              const SizedBox(width: 12),
              unitField(),
            ],
          ),
          const SizedBox(height: 8),
          numberField(_start, '起始值（選填，空白＝目前的數字）'),
          hint('進度從起始值算到目標，體重 75→70 這種往下的目標也算得對。之後在 LINE 說「體重現在 72」就會更新。'),
        ];
      case _Mode.accountBalance:
        final accountsAsync = ref.watch(lifeGoalTrackingOptionsProvider);
        return [
          const SizedBox(height: 8),
          accountsAsync.when(
            data: (accounts) => accounts.isEmpty
                ? const Text('記帳裡還沒有任何帳戶，先去記帳新增一個帳戶吧')
                : DropdownButtonFormField<String>(
                    initialValue: accounts.any((a) => a.id == _accountId) ? _accountId : null,
                    decoration: const InputDecoration(labelText: '追蹤哪個帳戶'),
                    items: [for (final a in accounts) DropdownMenuItem(value: a.id, child: Text(a.name))],
                    onChanged: (id) => setState(() => _accountId = id),
                  ),
            loading: () => const LinearProgressIndicator(),
            error: (e, _) => Text('讀取帳戶失敗：$e'),
          ),
          Row(children: [Expanded(child: numberField(_target, '目標金額')), const SizedBox(width: 12), unitField()]),
          hint('帳戶餘額每次記帳都會自動更新，不用自己改數字。'),
        ];
      case _Mode.netWorth:
      case _Mode.stockValue:
        return [
          const SizedBox(height: 8),
          Row(children: [Expanded(child: numberField(_target, '目標金額')), const SizedBox(width: 12), unitField()]),
          hint(_mode == _Mode.netWorth ? '跟財務報表的淨資產同一個數字，自動更新。' : '持股總市值，股價更新時自動跟著變。'),
        ];
      case _Mode.noteKeywordSum:
        return [
          const SizedBox(height: 8),
          TextField(
            controller: _keyword,
            decoration: const InputDecoration(labelText: '備註關鍵字', hintText: '例如：旅遊基金'),
            onChanged: (_) => setState(() {}),
          ),
          Row(children: [Expanded(child: numberField(_target, '目標金額')), const SizedBox(width: 12), unitField()]),
          hint('記帳時備註寫了這個關鍵字的收入／轉帳，會自動加總進度。'),
        ];
      case _Mode.checkIn:
        return [
          const SizedBox(height: 8),
          Row(children: [Expanded(child: numberField(_target, '目標次數（選填）')), const SizedBox(width: 12), unitField()]),
          const SizedBox(height: 8),
          SegmentedButton<LifeGoalPeriod>(
            segments: const [
              ButtonSegment(value: LifeGoalPeriod.total, label: Text('累計')),
              ButtonSegment(value: LifeGoalPeriod.weekly, label: Text('每週')),
              ButtonSegment(value: LifeGoalPeriod.monthly, label: Text('每月')),
            ],
            selected: {_period},
            onSelectionChanged: (s) => setState(() => _period = s.first),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('打卡一定要寫心得'),
            subtitle: const Text('例如讀書：要寫最喜歡的一句話或心得才算讀完'),
            value: _requireNote,
            onChanged: (v) => setState(() => _requireNote = v),
          ),
        ];
    }
  }
}
