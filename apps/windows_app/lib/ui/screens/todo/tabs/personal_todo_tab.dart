import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project_todo.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/todo_provider.dart';
import '../todo_tile.dart';

/// 個人事項 — deliberately kept simple per the user's own spec: just a
/// title and an optional due date, no priority/notes/assignee (those are a
/// 工作 concept, see `WorkTodoTab`).
class PersonalTodoTab extends ConsumerWidget {
  const PersonalTodoTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overviewAsync = ref.watch(todoOverviewProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context, ref, null),
        icon: const Icon(Icons.add),
        label: const Text('新增個人事項'),
      ),
      body: overviewAsync.when(
        data: (overview) {
          final todos = overview.personal;
          if (todos.isEmpty) {
            return const Center(child: Text('還沒有任何個人事項，點右下角新增一個吧'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: todos.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final todo = todos[index];
              return TodoTile(
                todo: todo,
                onToggleDone: (done) => _toggleDone(context, ref, todo, done),
                onEdit: () => _openEditor(context, ref, todo),
                onDelete: () => _delete(context, ref, todo),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取個人事項失敗：$error')),
      ),
    );
  }

  Future<void> _toggleDone(BuildContext context, WidgetRef ref, ProjectTodo todo, bool done) async {
    try {
      await ref.read(apiClientProvider).updateTodo(todoId: todo.id, done: done);
      ref.invalidate(todoOverviewProvider);
      ref.invalidate(completedTodosProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, ProjectTodo todo) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除個人事項'),
        content: Text('確定要刪除「${todo.title}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteTodo(todo.id);
      ref.invalidate(todoOverviewProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditor(BuildContext context, WidgetRef ref, ProjectTodo? existing) async {
    final titleController = TextEditingController(text: existing?.title ?? '');
    var dueDate = existing?.dueDate;
    // 每一筆代辦事項都必須是「有日期」或「持續性任務」二選一——沒有第三種
    // 「都不選」的狀態，所以新增時預設落在「設定日期」而不是留空。
    var isOngoing = existing?.isOngoing ?? false;
    // 2026-08-05：跟行事曆同一套「全天/指定時間」概念，讓代辦事項也能帶時間。
    var allDay = existing?.dueDateAllDay ?? true;
    var time = TimeOfDay(hour: existing?.dueDate?.hour ?? 9, minute: existing?.dueDate?.minute ?? 0);

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增個人事項' : '編輯個人事項'),
          content: SizedBox(
            width: 320,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: titleController,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: '項目'),
                ),
                const SizedBox(height: 12),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: false, label: Text('設定日期')),
                    ButtonSegment(value: true, label: Text('持續性任務')),
                  ],
                  selected: {isOngoing},
                  onSelectionChanged: (selection) => setState(() {
                    isOngoing = selection.first;
                    if (isOngoing) dueDate = null;
                  }),
                ),
                if (!isOngoing) ...[
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: dueDate ?? DateTime.now(),
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) setState(() => dueDate = picked);
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: '日期',
                        suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
                      ),
                      child: Text(
                        dueDate == null ? '未設定' : '${dueDate!.year}/${dueDate!.month}/${dueDate!.day}',
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('全天'),
                    value: allDay,
                    onChanged: (v) => setState(() => allDay = v),
                  ),
                  if (!allDay)
                    InkWell(
                      onTap: () async {
                        final picked = await showTimePicker(context: context, initialTime: time);
                        if (picked != null) setState(() => time = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: '時間'),
                        child: Text(time.format(context)),
                      ),
                    ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(
              onPressed: !isOngoing && dueDate == null ? null : () => Navigator.of(context).pop(true),
              child: const Text('儲存'),
            ),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;

    final title = titleController.text.trim();
    if (title.isEmpty) return;
    final effectiveDueDate = dueDate == null
        ? null
        : allDay
        ? DateTime(dueDate!.year, dueDate!.month, dueDate!.day)
        : DateTime(dueDate!.year, dueDate!.month, dueDate!.day, time.hour, time.minute);

    try {
      final api = ref.read(apiClientProvider);
      if (existing == null) {
        await api.createTodo(
          title: title,
          dueDate: effectiveDueDate,
          dueDateAllDay: allDay,
          isOngoing: isOngoing,
        );
      } else {
        await api.updateTodo(
          todoId: existing.id,
          title: title,
          dueDate: effectiveDueDate,
          dueDateAllDay: allDay,
          clearDueDate: effectiveDueDate == null,
          isOngoing: isOngoing,
        );
      }
      ref.invalidate(todoOverviewProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
