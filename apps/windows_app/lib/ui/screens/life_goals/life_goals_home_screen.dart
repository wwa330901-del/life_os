import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/life_goal.dart';
import '../../../state/auth_provider.dart';
import '../../../state/life_goal_provider.dart';
import 'life_goal_editor_dialog.dart';

/// 人生目標 — account-level module, independent of any Space. 進行中 vs
/// 已結束（已完成＋已放棄）split the same single `/life-goals` list
/// client-side; a person's goal count is small enough that paging (like
/// 代辦事項's 已完成 history) isn't worth it.
class LifeGoalsHomeScreen extends ConsumerStatefulWidget {
  const LifeGoalsHomeScreen({super.key});

  @override
  ConsumerState<LifeGoalsHomeScreen> createState() => _LifeGoalsHomeScreenState();
}

class _LifeGoalsHomeScreenState extends ConsumerState<LifeGoalsHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final goalsAsync = ref.watch(lifeGoalsProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('新增目標'),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TabBar(
            controller: _tabController,
            tabs: const [
              Tab(text: '進行中'),
              Tab(text: '已結束'),
            ],
          ),
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: scheme.primaryContainer.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Text(
              '💬 在 LINE 直接用講的就能記錄，例如「讀完原子習慣，最喜歡：每天進步1%」「體重現在72」「今天運動了」。'
              '期限剩 7 天、1 天時 LINE 會提醒你。',
              style: TextStyle(fontSize: 12),
            ),
          ),
          Expanded(
            child: goalsAsync.when(
              data: (goals) => TabBarView(
                controller: _tabController,
                children: [
                  _GoalList(
                    goals: goals.where((g) => g.status == LifeGoalStatus.active).toList(),
                    emptyText: '還沒有任何目標，點右下角新增一個吧',
                  ),
                  _GoalList(
                    goals: goals.where((g) => g.status != LifeGoalStatus.active).toList(),
                    emptyText: '還沒有完成或放棄的目標',
                  ),
                ],
              ),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取人生目標失敗：$error')),
            ),
          ),
        ],
      ),
    );
  }
}

class _GoalList extends StatelessWidget {
  const _GoalList({required this.goals, required this.emptyText});

  final List<LifeGoal> goals;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    if (goals.isEmpty) {
      return Center(child: Text(emptyText));
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      itemCount: goals.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) => _GoalCard(key: ValueKey(goals[index].id), goal: goals[index]),
    );
  }
}

class _GoalCard extends ConsumerStatefulWidget {
  const _GoalCard({super.key, required this.goal});

  final LifeGoal goal;

  @override
  ConsumerState<_GoalCard> createState() => _GoalCardState();
}

class _GoalCardState extends ConsumerState<_GoalCard> {
  var _showCheckIns = false;

  @override
  Widget build(BuildContext context) {
    final goal = widget.goal;
    final scheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final progress = goal.progress;
    final isActive = goal.status == LifeGoalStatus.active;
    final isCheckIn = goal.trackingType == LifeGoalTrackingType.checkIn;
    final dueText = _dueText(goal);
    final progressText = _progressText(goal);

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        goal.title,
                        style: textTheme.titleMedium?.copyWith(
                          decoration: goal.status == LifeGoalStatus.abandoned ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      if (goal.category != null) _Tag(text: goal.category!, color: scheme.secondaryContainer),
                      if (!isActive)
                        _Tag(
                          text: goal.status.label,
                          color: goal.status == LifeGoalStatus.completed
                              ? scheme.primaryContainer
                              : scheme.surfaceContainerHighest,
                        ),
                    ],
                  ),
                ),
                if (isActive && isCheckIn)
                  FilledButton.tonalIcon(
                    onPressed: () => _checkIn(context, ref, goal),
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('打卡'),
                  ),
                if (isActive && goal.trackingType == LifeGoalTrackingType.manual && goal.targetValue != null)
                  TextButton(onPressed: () => _updateProgress(context, ref, goal), child: const Text('更新進度')),
                PopupMenuButton<_GoalAction>(
                  onSelected: (action) => _handleAction(context, ref, goal, action),
                  itemBuilder: (context) => [
                    const PopupMenuItem(value: _GoalAction.edit, child: Text('編輯')),
                    if (isActive) ...[
                      const PopupMenuItem(value: _GoalAction.complete, child: Text('標記完成')),
                      const PopupMenuItem(value: _GoalAction.abandon, child: Text('放棄')),
                    ] else
                      const PopupMenuItem(value: _GoalAction.reopen, child: Text('重新開始')),
                    const PopupMenuItem(value: _GoalAction.delete, child: Text('刪除')),
                  ],
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (goal.trackingDescription != null) ...[
                    const SizedBox(height: 2),
                    Text(goal.trackingDescription!, style: textTheme.bodySmall?.copyWith(color: scheme.primary)),
                  ],
                  if (progress != null) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(value: progress, minHeight: 8),
                    ),
                  ],
                  if (progressText != null) ...[
                    const SizedBox(height: 4),
                    Text(progressText, style: textTheme.bodySmall),
                  ],
                  if (dueText != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      dueText.text,
                      style: textTheme.bodySmall?.copyWith(color: dueText.overdue ? scheme.error : null),
                    ),
                  ],
                  if (goal.notes != null) ...[
                    const SizedBox(height: 6),
                    Text(goal.notes!, style: textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                  ],
                  if (isCheckIn) ...[
                    TextButton.icon(
                      style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                      onPressed: () => setState(() => _showCheckIns = !_showCheckIns),
                      icon: Icon(_showCheckIns ? Icons.expand_less : Icons.expand_more, size: 18),
                      label: Text(_showCheckIns ? '收起紀錄' : '看打卡紀錄'),
                    ),
                    if (_showCheckIns) _CheckInHistory(goal: goal),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 「45,000 / 150,000 元　30%」, or for check-ins 「本週 2 / 3 次」／「累計已打卡 5 本」.
String? _progressText(LifeGoal goal) {
  final unit = goal.unit == null ? '' : ' ${goal.unit}';
  final current = goal.currentValue;
  if (goal.trackingType == LifeGoalTrackingType.checkIn) {
    final count = formatGoalNumber(current ?? 0);
    final label = goal.checkInPeriod.label;
    if (goal.targetValue == null) return '$label已打卡 $count$unit';
    return '$label $count / ${formatGoalNumber(goal.targetValue!)}$unit　${(goal.progress! * 100).floor()}%';
  }
  if (goal.targetValue == null) return null;
  if (current == null) return '目前讀不到數字（帳戶可能已刪除）';
  return '${formatGoalNumber(current)} / ${formatGoalNumber(goal.targetValue!)}$unit　${(goal.progress! * 100).floor()}%';
}

class _CheckInHistory extends ConsumerWidget {
  const _CheckInHistory({required this.goal});

  final LifeGoal goal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final checkInsAsync = ref.watch(lifeGoalCheckInsProvider(goal.id));

    return checkInsAsync.when(
      data: (checkIns) {
        if (checkIns.isEmpty) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text('還沒有打卡紀錄', style: textTheme.bodySmall),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final c in checkIns)
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.fromLTRB(10, 6, 0, 6),
                decoration: BoxDecoration(
                  border: Border(left: BorderSide(color: scheme.primary.withValues(alpha: 0.5), width: 3)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${c.date.month}/${c.date.day}'
                            '${c.title == null ? '' : '　${c.title}'}'
                            '${c.value == 1 ? '' : '　×${formatGoalNumber(c.value)}'}',
                            style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                          ),
                          if (c.note != null)
                            Text('「${c.note}」', style: textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic)),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: '刪除這筆打卡',
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () async {
                        try {
                          await ref.read(apiClientProvider).deleteLifeGoalCheckIn(c.id);
                          ref.invalidate(lifeGoalCheckInsProvider(goal.id));
                          ref.invalidate(lifeGoalsProvider);
                        } on ApiException catch (e) {
                          if (context.mounted) _showError(context, e);
                        }
                      },
                    ),
                  ],
                ),
              ),
          ],
        );
      },
      loading: () => const LinearProgressIndicator(),
      error: (e, _) => Text('讀取打卡紀錄失敗：$e'),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: const TextStyle(fontSize: 12)),
    );
  }
}

/// 期限文字：進行中的目標顯示「還剩 N 天／已逾期 N 天」讓人有時間感；
/// 已結束的目標只顯示完成日（或原本的期限），逾期已經沒有意義。
({String text, bool overdue})? _dueText(LifeGoal goal) {
  String fmt(DateTime d) => '${d.year}/${d.month}/${d.day}';

  if (goal.status == LifeGoalStatus.completed && goal.completedAt != null) {
    return (text: '完成於 ${fmt(goal.completedAt!)}', overdue: false);
  }
  final target = goal.targetDate;
  if (target == null) return null;
  if (goal.status != LifeGoalStatus.active) {
    return (text: '期限 ${fmt(target)}', overdue: false);
  }
  final now = DateTime.now();
  final days = target.difference(DateTime(now.year, now.month, now.day)).inDays;
  if (days < 0) return (text: '期限 ${fmt(target)}（已逾期 ${-days} 天）', overdue: true);
  if (days == 0) return (text: '期限 ${fmt(target)}（就是今天）', overdue: false);
  return (text: '期限 ${fmt(target)}（還剩 $days 天）', overdue: false);
}

enum _GoalAction { edit, complete, abandon, reopen, delete }

void _showError(BuildContext context, ApiException e) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
}

Future<void> _handleAction(BuildContext context, WidgetRef ref, LifeGoal goal, _GoalAction action) async {
  switch (action) {
    case _GoalAction.edit:
      await _openEditor(context, ref, goal);
    case _GoalAction.complete:
      await _setStatus(context, ref, goal, LifeGoalStatus.completed);
    case _GoalAction.abandon:
      await _setStatus(context, ref, goal, LifeGoalStatus.abandoned);
    case _GoalAction.reopen:
      await _setStatus(context, ref, goal, LifeGoalStatus.active);
    case _GoalAction.delete:
      await _delete(context, ref, goal);
  }
}

Future<void> _openEditor(BuildContext context, WidgetRef ref, LifeGoal? existing) async {
  final allGoals = ref.read(lifeGoalsProvider).value ?? const <LifeGoal>[];
  final input = await showLifeGoalEditor(context, existing: existing, allGoals: allGoals);
  if (input == null || !context.mounted) return;

  try {
    final api = ref.read(apiClientProvider);
    if (existing == null) {
      await api.createLifeGoal(input);
    } else {
      await api.updateLifeGoal(id: existing.id, input: input);
    }
    ref.invalidate(lifeGoalsProvider);
  } on ApiException catch (e) {
    if (context.mounted) _showError(context, e);
  }
}

Future<void> _setStatus(BuildContext context, WidgetRef ref, LifeGoal goal, LifeGoalStatus status) async {
  try {
    await ref.read(apiClientProvider).updateLifeGoalStatus(id: goal.id, status: status);
    ref.invalidate(lifeGoalsProvider);
  } on ApiException catch (e) {
    if (context.mounted) _showError(context, e);
  }
}

Future<void> _delete(BuildContext context, WidgetRef ref, LifeGoal goal) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('刪除目標'),
      content: Text('確定要刪除「${goal.title}」嗎？如果只是不想繼續，可以改用「放棄」保留紀錄。'),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
        FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return;

  try {
    await ref.read(apiClientProvider).deleteLifeGoal(goal.id);
    ref.invalidate(lifeGoalsProvider);
  } on ApiException catch (e) {
    if (context.mounted) _showError(context, e);
  }
}

/// 打卡 dialog — for a goal with `requireCheckInNote` (讀書) the 心得 field
/// is mandatory, the whole point being proof the book was actually read.
Future<void> _checkIn(BuildContext context, WidgetRef ref, LifeGoal goal) async {
  final titleController = TextEditingController();
  final noteController = TextEditingController();
  final valueController = TextEditingController(text: '1');

  final saved = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final noteOk = !goal.requireCheckInNote || noteController.text.trim().isNotEmpty;
        final valueOk = (double.tryParse(valueController.text.trim()) ?? 0) > 0;
        return AlertDialog(
          title: Text('打卡：${goal.title}'),
          content: SizedBox(
            width: 380,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleController,
                  autofocus: true,
                  decoration: InputDecoration(
                    labelText: goal.requireCheckInNote ? '書名／內容' : '做了什麼（選填）',
                    hintText: goal.requireCheckInNote ? '例如：原子習慣' : '例如：跑步 5 公里',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: noteController,
                  minLines: 2,
                  maxLines: 5,
                  decoration: InputDecoration(
                    labelText: goal.requireCheckInNote ? '最喜歡的一句話或心得（必填）' : '心得（選填）',
                    errorText: noteOk ? null : '要寫心得或最喜歡的一句話才算數喔',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: valueController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: '算幾次', suffixText: goal.unit),
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(
              onPressed: noteOk && valueOk ? () => Navigator.of(context).pop(true) : null,
              child: const Text('打卡'),
            ),
          ],
        );
      },
    ),
  );
  if (saved != true || !context.mounted) return;

  String? trimmed(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
  try {
    await ref.read(apiClientProvider).addLifeGoalCheckIn(
      goalId: goal.id,
      title: trimmed(titleController),
      note: trimmed(noteController),
      value: double.tryParse(valueController.text.trim()),
    );
    ref.invalidate(lifeGoalsProvider);
    ref.invalidate(lifeGoalCheckInsProvider(goal.id));
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已打卡：${goal.title}')));
    }
  } on ApiException catch (e) {
    if (context.mounted) _showError(context, e);
  }
}

/// Quick path for the most common MANUAL edit — bumping the current number —
/// without opening the full editor.
Future<void> _updateProgress(BuildContext context, WidgetRef ref, LifeGoal goal) async {
  final controller = TextEditingController(text: formatGoalNumber(goal.currentValue ?? 0).replaceAll(',', ''));
  final value = await showDialog<double>(
    context: context,
    builder: (context) {
      void submit() {
        final parsed = double.tryParse(controller.text.trim());
        if (parsed != null) Navigator.of(context).pop(parsed);
      }

      return AlertDialog(
        title: Text('更新進度：${goal.title}'),
        content: SizedBox(
          width: 280,
          child: TextField(
            controller: controller,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: '目前數值',
              suffixText: '/ ${formatGoalNumber(goal.targetValue!)}${goal.unit == null ? '' : ' ${goal.unit}'}',
            ),
            onSubmitted: (_) => submit(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: submit, child: const Text('儲存')),
        ],
      );
    },
  );
  if (value == null || !context.mounted) return;

  // The snackbar action can fire after this card's element is gone (the
  // list rebuilds on invalidate), so it uses the container directly rather
  // than this widget's `ref`/`context`.
  final container = ProviderScope.containerOf(context, listen: false);
  final messenger = ScaffoldMessenger.of(context);
  try {
    await ref.read(apiClientProvider).updateLifeGoalProgress(id: goal.id, currentValue: value);
    ref.invalidate(lifeGoalsProvider);
    if (value >= goal.targetValue!) {
      messenger.showSnackBar(
        SnackBar(
          content: Text('「${goal.title}」已達標！'),
          action: SnackBarAction(
            label: '標記完成',
            onPressed: () async {
              try {
                await container
                    .read(apiClientProvider)
                    .updateLifeGoalStatus(id: goal.id, status: LifeGoalStatus.completed);
                container.invalidate(lifeGoalsProvider);
              } on ApiException catch (e) {
                messenger.showSnackBar(SnackBar(content: Text(e.message)));
              }
            },
          ),
        ),
      );
    }
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}
