import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/models/finance_plan.dart';
import 'finance_format.dart';

/// 財務規劃問卷（2026-10-07）：規劃前分 7 步問清楚——收入、每月固定支出、一年一次的
/// 大筆支出、生活費、家底、目標、想法偏好。上次填過的直接帶出來；第一次就帶系統已經
/// 知道的（固定收支、貸款還款、訂閱、購物車和人生目標）。勾選為主、少打字。
/// 回傳 null＝取消。
Future<FinancePlanAnswers?> showFinancePlanQuestionsDialog(BuildContext context, FinancePlanProfileForm form) {
  return showDialog<FinancePlanAnswers>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _QuestionsDialog(form: form),
  );
}

const _fixedPresets = [
  '房租或房貸',
  '管理費',
  '水電瓦斯',
  '網路',
  '電話費',
  '壽險',
  '醫療或意外險',
  '車險',
  '孝親費',
  '小孩',
  '寵物',
  '交通（油錢、停車、月票）',
];
const _annualPresets = ['牌照稅', '燃料稅', '保險年繳', '車子保養', '過年紅包', '旅遊', '所得稅', '各種年費'];
const _otherIncomePresets = ['年終', '獎金', '兼職或接案', '租金', '股利'];
const _priorityLabels = {
  'emergency': '存緊急預備金',
  'debt': '還債',
  'goals': '存目標',
  'invest': '投資',
  'lifestyle': '生活品質',
};
const _riskLabels = {
  'conservative': '保守（不想虧錢）',
  'balanced': '穩健（小波動可以）',
  'aggressive': '積極（追求長期報酬）',
  'none': '先不投資',
};
const _stabilityLabels = {'stable': '穩定', 'variable': '每月會變動', 'changing': '接下來可能有變化'};

String _amountText(double? v) => v == null || v <= 0 ? '' : v.round().toString();
double? _num(String text) {
  final v = double.tryParse(text.trim().replaceAll(',', ''));
  return v != null && v > 0 ? v : null;
}

/// 勾選＋金額（＋月份）的一列。
class _Item {
  _Item(this.name, {this.checked = false, double? amount, this.month, this.custom = false})
    : nameController = TextEditingController(text: name),
      amount = TextEditingController(text: _amountText(amount));

  final String name;
  bool checked;
  final bool custom;
  int? month;
  final TextEditingController nameController;
  final TextEditingController amount;

  String get label => custom ? nameController.text.trim() : name;

  void dispose() {
    nameController.dispose();
    amount.dispose();
  }
}

class _Goal {
  _Goal({String name = '', double? amount, this.targetMonth})
    : name = TextEditingController(text: name),
      amount = TextEditingController(text: _amountText(amount));

  final TextEditingController name;
  final TextEditingController amount;
  String? targetMonth;

  void dispose() {
    name.dispose();
    amount.dispose();
  }
}

class _QuestionsDialog extends StatefulWidget {
  const _QuestionsDialog({required this.form});

  final FinancePlanProfileForm form;

  @override
  State<_QuestionsDialog> createState() => _QuestionsDialogState();
}

class _QuestionsDialogState extends State<_QuestionsDialog> {
  static const _titles = ['收入', '每月固定支出', '一年一次的大筆支出', '生活費', '你的家底', '目標', '你的想法'];
  int _step = 0;

  late final FinancePlanAnswers? _prev = widget.form.profile;

  // 1 收入
  late final _income = TextEditingController(
    text: _amountText(_prev?.monthlyIncome ?? widget.form.suggestedIncome),
  );
  late int? _payDay = _prev?.payDay ?? widget.form.suggestedPayDay;
  late final List<_Item> _otherIncome = _buildItems(
    _otherIncomePresets,
    _prev?.otherIncome.map((e) => (e.name, e.amount, null as int?)).toList() ?? const [],
  );
  late String? _stability = _prev?.incomeStability;
  late final _changeNote = TextEditingController(text: _prev?.incomeChangeNote ?? '');

  // 2 固定支出
  late final List<_Item> _fixed = _buildItems(
    _fixedPresets,
    (_prev?.fixedExpenses ?? widget.form.suggestedFixedExpenses).map((e) => (e.name, e.amount, null as int?)).toList(),
  );

  // 3 年度支出
  late final List<_Item> _annual = _buildItems(
    _annualPresets,
    _prev?.annualExpenses.map((e) => (e.name, e.amount, e.month)).toList() ?? const [],
  );

  // 4 生活費
  late final _living = TextEditingController(
    text: _amountText(_prev?.livingExpense ?? widget.form.suggestedLivingExpense),
  );

  // 5 家底
  late int _emergencyMonths = _prev?.emergencyMonths ?? 6;
  late final _otherAssets = TextEditingController(text: _prev?.otherAssets ?? '');

  // 6 目標
  late final List<_Goal> _goals = [
    for (final g in (_prev?.goals ?? widget.form.suggestedGoals))
      _Goal(name: g.name, amount: g.amount, targetMonth: g.targetMonth),
  ];

  // 7 想法
  late final _savingTarget = TextEditingController(text: _amountText(_prev?.savingTarget));
  late final _savingRate = TextEditingController(text: _prev?.savingRate?.toString() ?? '');
  late final List<String> _priorities = [
    ...?_prev?.priorities.where(_priorityLabels.containsKey),
    ..._priorityLabels.keys.where((k) => !(_prev?.priorities.contains(k) ?? false)),
  ];
  late String? _risk = _prev?.riskProfile;
  late final _cutBack = TextEditingController(text: _prev?.cutBack ?? '');
  late final _thoughts = TextEditingController(text: _prev?.thoughts ?? '');

  /// 預設項目（沒勾）＋已經有的（勾起來、帶金額）；不在預設裡的變成自訂列。
  static List<_Item> _buildItems(List<String> presets, List<(String, double, int?)> existing) {
    final byName = {for (final e in existing) e.$1: e};
    return [
      for (final p in presets)
        _Item(p, checked: byName.containsKey(p), amount: byName[p]?.$2, month: byName[p]?.$3),
      for (final e in existing)
        if (!presets.contains(e.$1)) _Item(e.$1, checked: true, amount: e.$2, month: e.$3, custom: true),
    ];
  }

  @override
  void dispose() {
    for (final c in [_income, _changeNote, _living, _otherAssets, _savingTarget, _savingRate, _cutBack, _thoughts]) {
      c.dispose();
    }
    for (final i in [..._otherIncome, ..._fixed, ..._annual]) {
      i.dispose();
    }
    for (final g in _goals) {
      g.dispose();
    }
    super.dispose();
  }

  List<PlanFixedExpense> _checked(List<_Item> items) => [
    for (final i in items)
      if (i.checked && i.label.isNotEmpty && _num(i.amount.text) != null)
        PlanFixedExpense(name: i.label, amount: _num(i.amount.text)!),
  ];

  String _termOf(String? targetMonth) {
    if (targetMonth == null) return 'mid';
    final now = DateTime.now();
    final months =
        (int.parse(targetMonth.substring(0, 4)) - now.year) * 12 + int.parse(targetMonth.substring(5, 7)) - now.month;
    return months <= 12 ? 'short' : (months <= 60 ? 'mid' : 'long');
  }

  void _finish() {
    String? text(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final rate = int.tryParse(_savingRate.text.trim());
    Navigator.of(context).pop(
      FinancePlanAnswers(
        monthlyIncome: _num(_income.text),
        payDay: _payDay,
        otherIncome: _checked(_otherIncome),
        incomeStability: _stability,
        incomeChangeNote: _stability == 'changing' ? text(_changeNote) : null,
        fixedExpenses: _checked(_fixed),
        annualExpenses: [
          for (final i in _annual)
            if (i.checked && i.label.isNotEmpty && _num(i.amount.text) != null)
              PlanAnnualExpense(name: i.label, amount: _num(i.amount.text)!, month: i.month),
        ],
        livingExpense: _num(_living.text),
        emergencyMonths: _emergencyMonths,
        otherAssets: text(_otherAssets),
        goals: [
          for (final g in _goals)
            if (g.name.text.trim().isNotEmpty && _num(g.amount.text) != null)
              PlanGoalInput(
                name: g.name.text.trim(),
                amount: _num(g.amount.text)!,
                targetMonth: g.targetMonth,
                term: _termOf(g.targetMonth),
              ),
        ],
        savingTarget: _num(_savingTarget.text),
        savingRate: rate != null && rate > 0 && rate < 90 ? rate : null,
        priorities: _priorities,
        riskProfile: _risk,
        cutBack: text(_cutBack),
        thoughts: text(_thoughts),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final size = MediaQuery.of(context).size;
    final last = _step == _titles.length - 1;
    return Dialog(
      child: SizedBox(
        width: math.min(600, size.width - 32),
        height: math.min(760, size.height - 48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('財務規劃問卷', style: theme.textTheme.bodySmall),
                  const SizedBox(height: 2),
                  Text('${_step + 1}/${_titles.length}　${_titles[_step]}', style: theme.textTheme.titleLarge),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: (_step + 1) / _titles.length),
                  if (_prev != null && _step == 0) ...[
                    const SizedBox(height: 8),
                    Text('已帶入你上次填的，沒變就直接按下一步。', style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
                child: [
                  _incomeStep,
                  _fixedStep,
                  _annualStep,
                  _livingStep,
                  _assetsStep,
                  _goalsStep,
                  _thoughtsStep,
                ][_step](theme),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                children: [
                  TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
                  const Spacer(),
                  if (_step > 0)
                    OutlinedButton(onPressed: () => setState(() => _step--), child: const Text('上一步')),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: last ? _finish : () => setState(() => _step++),
                    child: Text(last ? '開始規劃' : '下一步'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _question(ThemeData theme, String title, [String? hint]) => Padding(
    padding: const EdgeInsets.only(top: 12, bottom: 4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.titleSmall),
        if (hint != null) Text(hint, style: theme.textTheme.bodySmall),
      ],
    ),
  );

  Widget _incomeStep(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _question(theme, '每月實拿薪水多少？', '扣完勞健保、實際進帳的金額'),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: _income,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: '例如 45000', suffixText: '元'),
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 130,
            child: DropdownButtonFormField<int?>(
              initialValue: _payDay,
              decoration: const InputDecoration(labelText: '幾號發薪'),
              items: [
                const DropdownMenuItem(value: null, child: Text('不確定')),
                for (var d = 1; d <= 31; d++) DropdownMenuItem(value: d, child: Text('$d 號')),
              ],
              onChanged: (v) => setState(() => _payDay = v),
            ),
          ),
        ],
      ),
      _question(theme, '還有其他收入嗎？有就勾，填「一年大概多少」', '例如年終 2 個月、月薪 5 萬 → 100000'),
      _itemList(_otherIncome, amountHint: '一年多少', addLabel: '其他收入'),
      _question(theme, '收入穩定嗎？'),
      Wrap(
        spacing: 8,
        children: [
          for (final e in _stabilityLabels.entries)
            ChoiceChip(
              label: Text(e.value),
              selected: _stability == e.key,
              onSelected: (_) => setState(() => _stability = e.key),
            ),
        ],
      ),
      if (_stability == 'changing')
        TextField(
          controller: _changeNote,
          decoration: const InputDecoration(hintText: '會怎麼變？例如明年加薪、想換工作、要留職停薪'),
        ),
    ],
  );

  Widget _fixedStep(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _question(theme, '每個月固定要付的，有就勾起來填金額', '系統知道的（定期交易、貸款還款、訂閱）已經先勾好了'),
      _itemList(_fixed, amountHint: '每月多少', addLabel: '再加一項'),
      const SizedBox(height: 8),
      Text('合計每月 ${formatAmount(_checked(_fixed).fold<double>(0, (s, e) => s + e.amount))}', style: theme.textTheme.bodyMedium),
    ],
  );

  Widget _annualStep(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _question(
        theme,
        '一年才付一次的大筆支出，有就勾起來',
        '很多人預算爆掉就是這些，規劃時會換算成每月先存多少。月份不確定可以不選。',
      ),
      _itemList(_annual, amountHint: '一年多少', addLabel: '再加一項', withMonth: true),
      const SizedBox(height: 8),
      Builder(
        builder: (_) {
          final total = _annual
              .where((i) => i.checked)
              .fold<double>(0, (s, i) => s + (_num(i.amount.text) ?? 0));
          return Text(
            total > 0 ? '一年 ${formatAmount(total)}，平均每月要先存 ${formatAmount(total / 12)}' : '沒有就直接下一步',
            style: theme.textTheme.bodyMedium,
          );
        },
      ),
    ],
  );

  Widget _livingStep(ThemeData theme) {
    final form = widget.form;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _question(theme, '餐飲、購物、娛樂這些生活費，每月大概花多少？'),
        TextField(
          controller: _living,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: '例如 15000', suffixText: '元'),
        ),
        const SizedBox(height: 12),
        Text(
          form.recordedMonths > 0
              ? '記帳參考：近 ${form.recordedMonths} 個月平均每月支出 ${formatAmount(form.averageMonthlyExpense)}'
                    '${form.topCategories.isEmpty ? '' : '\n花最多：${form.topCategories.map((c) => '${c.name} ${formatAmount(c.amount)}').join('、')}'}'
              : '最近沒有記帳紀錄，先估一個數字就好。',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }

  Widget _assetsStep(ThemeData theme) {
    final form = widget.form;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _question(theme, '系統目前知道的'),
        Text('淨資產（帳戶＋股票＋借出－借入）：${formatAmount(form.netWorth)}'),
        if (form.stockCost > 0) Text('股票投入成本：${formatAmount(form.stockCost)}'),
        for (final d in form.debts) Text('還欠 ${d.name}：${formatAmount(d.amount)}'),
        _question(theme, '緊急預備金想留幾個月的生活費？', '失業、生病時的保命錢，一般建議 6 個月'),
        Wrap(
          spacing: 8,
          children: [
            for (final m in [3, 6, 12])
              ChoiceChip(
                label: Text('$m 個月'),
                selected: _emergencyMonths == m,
                onSelected: (_) => setState(() => _emergencyMonths = m),
              ),
          ],
        ),
        _question(theme, '股票以外還有其他投資或資產嗎？（選填）'),
        TextField(
          controller: _otherAssets,
          decoration: const InputDecoration(hintText: '例如：基金每月 3000、儲蓄險每年 5 萬、外幣定存'),
        ),
      ],
    );
  }

  Widget _goalsStep(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _question(
        theme,
        '有什麼想存錢達成的目標？',
        '短期（1 年內）：出國、買電腦；中期（1～5 年）：買車、結婚、頭期款、進修。\n購物車和人生目標裡的已經先帶進來了，退休在「退休」分頁另外算。',
      ),
      for (final (i, g) in _goals.indexed)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(controller: g.name, decoration: const InputDecoration(hintText: '要做什麼')),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  controller: g.amount,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(hintText: '多少錢'),
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: () => _pickMonth(g),
                child: Text(g.targetMonth == null ? '什麼時候？' : g.targetMonth!.replaceFirst('-', '/')),
              ),
              IconButton(
                tooltip: '移除',
                icon: const Icon(Icons.remove_circle_outline),
                onPressed: () => setState(() => _goals.removeAt(i).dispose()),
              ),
            ],
          ),
        ),
      TextButton.icon(
        onPressed: () => setState(() => _goals.add(_Goal())),
        icon: const Icon(Icons.add),
        label: const Text('加一個目標'),
      ),
    ],
  );

  Future<void> _pickMonth(_Goal g) async {
    final now = DateTime.now();
    final initial = g.targetMonth == null
        ? DateTime(now.year + 1, now.month)
        : DateTime(int.parse(g.targetMonth!.substring(0, 4)), int.parse(g.targetMonth!.substring(5, 7)));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year, now.month),
      lastDate: DateTime(now.year + 40),
      initialDatePickerMode: DatePickerMode.year,
      helpText: '希望什麼時候達成（選那個月的任一天）',
    );
    if (picked == null) return;
    setState(() => g.targetMonth = '${picked.year}-${picked.month.toString().padLeft(2, '0')}');
  }

  Widget _thoughtsStep(ThemeData theme) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _question(theme, '每月想存多少？（填一個就好，不知道可以空著）'),
      Row(
        children: [
          Expanded(
            child: TextField(
              controller: _savingTarget,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: '金額', suffixText: '元'),
            ),
          ),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Text('或')),
          Expanded(
            child: TextField(
              controller: _savingRate,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: '收入的', suffixText: '%'),
            ),
          ),
        ],
      ),
      _question(theme, '哪個最重要？按住右邊的 ≡ 拖曳排序，最上面最優先'),
      SizedBox(
        height: 56.0 * _priorities.length,
        child: ReorderableListView(
          buildDefaultDragHandles: false,
          onReorderItem: (from, to) => setState(() => _priorities.insert(to, _priorities.removeAt(from))),
          children: [
            for (final (i, key) in _priorities.indexed)
              ListTile(
                key: ValueKey(key),
                dense: true,
                leading: Text('${i + 1}'),
                title: Text(_priorityLabels[key]!),
                trailing: ReorderableDragStartListener(index: i, child: const Icon(Icons.drag_handle)),
              ),
          ],
        ),
      ),
      _question(theme, '投資可以接受多少風險？'),
      Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          for (final e in _riskLabels.entries)
            ChoiceChip(label: Text(e.value), selected: _risk == e.key, onSelected: (_) => setState(() => _risk = e.key)),
        ],
      ),
      _question(theme, '有沒有想減少的花費？（選填）'),
      TextField(controller: _cutBack, decoration: const InputDecoration(hintText: '例如：外食太多、網購、手搖飲')),
      _question(theme, '其他想法（選填）'),
      TextField(
        controller: _thoughts,
        minLines: 2,
        maxLines: 4,
        decoration: const InputDecoration(hintText: '任何在意的事都可以寫'),
      ),
    ],
  );

  Widget _itemList(List<_Item> items, {required String amountHint, required String addLabel, bool withMonth = false}) {
    return Column(
      children: [
        for (final (i, item) in items.indexed)
          Row(
            children: [
              Checkbox(value: item.checked, onChanged: (v) => setState(() => item.checked = v ?? false)),
              Expanded(
                flex: 3,
                child: item.custom
                    ? TextField(
                        controller: item.nameController,
                        decoration: const InputDecoration(hintText: '項目', isDense: true),
                      )
                    : GestureDetector(
                        onTap: () => setState(() => item.checked = !item.checked),
                        child: Text(item.name),
                      ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  controller: item.amount,
                  enabled: item.checked,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(hintText: amountHint, isDense: true),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              if (withMonth) ...[
                const SizedBox(width: 8),
                SizedBox(
                  width: 92,
                  child: DropdownButton<int?>(
                    value: item.month,
                    isExpanded: true,
                    hint: const Text('幾月'),
                    onChanged: item.checked ? (v) => setState(() => item.month = v) : null,
                    items: [
                      const DropdownMenuItem(value: null, child: Text('不確定')),
                      for (var m = 1; m <= 12; m++) DropdownMenuItem(value: m, child: Text('$m 月')),
                    ],
                  ),
                ),
              ],
              if (item.custom)
                IconButton(
                  tooltip: '移除',
                  icon: const Icon(Icons.remove_circle_outline),
                  onPressed: () => setState(() => items.removeAt(i).dispose()),
                )
              else
                const SizedBox(width: 48),
            ],
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => items.add(_Item('', checked: true, custom: true))),
            icon: const Icon(Icons.add),
            label: Text(addLabel),
          ),
        ),
      ],
    );
  }
}
