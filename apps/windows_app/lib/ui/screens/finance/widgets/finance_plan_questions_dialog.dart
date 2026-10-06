import 'package:flutter/material.dart';

import '../../../../core/models/finance_plan.dart';
import 'finance_format.dart';

/// 財務規劃前先問（2026-10-07 使用者要求「應該先問過我有什麼支出或想法」）：
/// 每月收入、固定支出、想法目標。上次填過的直接帶出來；第一次就帶記帳抓到的
/// 固定收支當起點。記帳平均顯示在上面當參考，規劃時 AI 也會一起看。
/// 回傳 null＝取消。
Future<FinancePlanAnswers?> showFinancePlanQuestionsDialog(BuildContext context, FinancePlanProfileForm form) {
  return showDialog<FinancePlanAnswers>(context: context, builder: (_) => _QuestionsDialog(form: form));
}

class _ExpenseRow {
  _ExpenseRow(String name, double? amount)
    : name = TextEditingController(text: name),
      amount = TextEditingController(text: amount == null ? '' : amount.round().toString());

  final TextEditingController name;
  final TextEditingController amount;

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
  late final FinancePlanAnswers? _previous = widget.form.profile;
  late final _income = TextEditingController(
    text: () {
      final v = _previous?.monthlyIncome ?? widget.form.suggestedIncome;
      return v == null || v <= 0 ? '' : v.round().toString();
    }(),
  );
  late final List<_ExpenseRow> _expenses = [
    for (final e in (_previous?.fixedExpenses ?? widget.form.suggestedFixedExpenses)) _ExpenseRow(e.name, e.amount),
  ];
  late final _thoughts = TextEditingController(text: _previous?.thoughts ?? '');

  @override
  void initState() {
    super.initState();
    if (_expenses.isEmpty) _expenses.add(_ExpenseRow('', null));
  }

  @override
  void dispose() {
    _income.dispose();
    _thoughts.dispose();
    for (final e in _expenses) {
      e.dispose();
    }
    super.dispose();
  }

  double? _num(String text) => double.tryParse(text.trim().replaceAll(',', ''));

  void _submit() {
    final expenses = [
      for (final e in _expenses)
        if (e.name.text.trim().isNotEmpty && (_num(e.amount.text) ?? 0) > 0)
          PlanFixedExpense(name: e.name.text.trim(), amount: _num(e.amount.text)!),
    ];
    final income = _num(_income.text);
    Navigator.of(context).pop(
      FinancePlanAnswers(
        monthlyIncome: income != null && income > 0 ? income : null,
        fixedExpenses: expenses,
        thoughts: _thoughts.text.trim().isEmpty ? null : _thoughts.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall;
    final form = widget.form;

    return AlertDialog(
      title: const Text('規劃前先問你幾件事'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                form.recordedMonths > 0
                    ? '記帳參考：近 ${form.recordedMonths} 個月平均收入 ${formatAmount(form.averageMonthlyIncome)}、'
                          '支出 ${formatAmount(form.averageMonthlyExpense)}'
                          '${form.topCategories.isEmpty ? '' : '；花最多：${form.topCategories.map((c) => '${c.name} ${formatAmount(c.amount)}').join('、')}'}'
                    : '最近沒有記帳紀錄，就照你填的規劃。',
                style: muted,
              ),
              if (_previous != null) ...[
                const SizedBox(height: 4),
                Text('已帶入你上次填的，有變就直接改。', style: muted),
              ],
              const SizedBox(height: 16),
              Text('1. 每月收入大概多少？', style: theme.textTheme.titleSmall),
              TextField(
                controller: _income,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '例如 50000（薪水＋其他固定收入）', suffixText: '元'),
              ),
              const SizedBox(height: 16),
              Text('2. 每月固定要付的有哪些？', style: theme.textTheme.titleSmall),
              Text('房租、保險、孝親費、貸款、電話費、訂閱…', style: muted),
              for (final (i, e) in _expenses.indexed)
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(controller: e.name, decoration: const InputDecoration(hintText: '項目')),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: e.amount,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(hintText: '每月金額', suffixText: '元'),
                      ),
                    ),
                    IconButton(
                      tooltip: '移除',
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: () => setState(() => _expenses.removeAt(i).dispose()),
                    ),
                  ],
                ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => setState(() => _expenses.add(_ExpenseRow('', null))),
                  icon: const Icon(Icons.add),
                  label: const Text('再加一項'),
                ),
              ),
              const SizedBox(height: 8),
              Text('3. 最近有什麼想法或目標？', style: theme.textTheme.titleSmall),
              TextField(
                controller: _thoughts,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  hintText: '例如：想一年存 20 萬當頭期款、年底想去日本、想開始定期定額、最近花太多在外食…',
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton.icon(onPressed: _submit, icon: const Icon(Icons.auto_awesome_outlined), label: const Text('開始規劃')),
      ],
    );
  }
}
