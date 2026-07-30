import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project_member.dart';
import '../../../../core/models/project_todo.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_members_provider.dart';
import '../../../../state/project_todos_provider.dart';

/// 專案代辦事項 — plain tasks with no duration (distinct from 工項/WorkItem,
/// which feeds the Gantt schedule engine). Title, done/not, optional due
/// date, priority, assignee (must be a project member), notes.
class ProjectTodosTab extends ConsumerWidget {
  const ProjectTodosTab({super.key, required this.projectId});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todosAsync = ref.watch(projectTodosProvider(projectId));
    final membersAsync = ref.watch(projectMembersProvider(projectId));
    final members = membersAsync.value ?? const <ProjectMember>[];
    final memberNameOf = {for (final m in members) m.userId: m.name};

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openEditor(context, ref, members, null),
        icon: const Icon(Icons.add),
        label: const Text('新增代辦事項'),
      ),
      body: todosAsync.when(
        data: (todos) {
          if (todos.isEmpty) {
            return const Center(child: Text('還沒有任何代辦事項，點右下角新增一個吧'));
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: todos.length,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final todo = todos[index];
              return _TodoTile(
                todo: todo,
                assigneeName: todo.assigneeUserId == null ? null : memberNameOf[todo.assigneeUserId],
                onToggleDone: (done) => _toggleDone(context, ref, todo, done),
                onEdit: () => _openEditor(context, ref, members, todo),
                onDelete: () => _delete(context, ref, todo),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取代辦事項失敗：$error')),
      ),
    );
  }

  Future<void> _toggleDone(BuildContext context, WidgetRef ref, ProjectTodo todo, bool done) async {
    try {
      await ref
          .read(apiClientProvider)
          .updateProjectTodo(projectId: projectId, todoId: todo.id, done: done);
      ref.invalidate(projectTodosProvider(projectId));
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
        title: const Text('刪除代辦事項'),
        content: Text('確定要刪除「${todo.title}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteProjectTodo(projectId: projectId, todoId: todo.id);
      ref.invalidate(projectTodosProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref,
    List<ProjectMember> members,
    ProjectTodo? existing,
  ) async {
    final titleController = TextEditingController(text: existing?.title ?? '');
    final notesController = TextEditingController(text: existing?.notes ?? '');
    var dueDate = existing?.dueDate;
    var priority = existing?.priority ?? TodoPriority.medium;
    var assigneeUserId = existing?.assigneeUserId;

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增代辦事項' : '編輯代辦事項'),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: titleController,
                    autofocus: true,
                    decoration: const InputDecoration(labelText: '標題'),
                  ),
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
                      decoration: InputDecoration(
                        labelText: '截止日（選填）',
                        suffixIcon: dueDate == null
                            ? const Icon(Icons.calendar_today_outlined, size: 18)
                            : IconButton(
                                icon: const Icon(Icons.clear, size: 18),
                                onPressed: () => setState(() => dueDate = null),
                              ),
                      ),
                      child: Text(
                        dueDate == null ? '未設定' : '${dueDate!.year}/${dueDate!.month}/${dueDate!.day}',
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<TodoPriority>(
                    initialValue: priority,
                    decoration: const InputDecoration(labelText: '優先順序'),
                    items: TodoPriority.values
                        .map((p) => DropdownMenuItem(value: p, child: Text(p.label)))
                        .toList(),
                    onChanged: (value) => setState(() => priority = value ?? priority),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    initialValue: assigneeUserId,
                    decoration: const InputDecoration(labelText: '指派給（選填）'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('未指派')),
                      for (final m in members) DropdownMenuItem(value: m.userId, child: Text(m.name)),
                    ],
                    onChanged: (value) => setState(() => assigneeUserId = value),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: '備註（選填）'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;

    final title = titleController.text.trim();
    if (title.isEmpty) return;
    final notes = notesController.text.trim();

    try {
      final api = ref.read(apiClientProvider);
      if (existing == null) {
        await api.createProjectTodo(
          projectId: projectId,
          title: title,
          dueDate: dueDate,
          priority: priority,
          notes: notes.isEmpty ? null : notes,
          assigneeUserId: assigneeUserId,
        );
      } else {
        await api.updateProjectTodo(
          projectId: projectId,
          todoId: existing.id,
          title: title,
          dueDate: dueDate,
          clearDueDate: dueDate == null,
          priority: priority,
          notes: notes.isEmpty ? null : notes,
          clearNotes: notes.isEmpty,
          assigneeUserId: assigneeUserId,
          clearAssignee: assigneeUserId == null,
        );
      }
      ref.invalidate(projectTodosProvider(projectId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _TodoTile extends StatelessWidget {
  const _TodoTile({
    required this.todo,
    required this.assigneeName,
    required this.onToggleDone,
    required this.onEdit,
    required this.onDelete,
  });

  final ProjectTodo todo;
  final String? assigneeName;
  final ValueChanged<bool> onToggleDone;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  Color _priorityColor(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return switch (todo.priority) {
      TodoPriority.high => scheme.error,
      TodoPriority.medium => Colors.orange,
      TodoPriority.low => scheme.onSurface.withValues(alpha: 0.4),
    };
  }

  bool get _isOverdue =>
      !todo.done && todo.dueDate != null && todo.dueDate!.isBefore(DateTime.now().subtract(const Duration(days: 1)));

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final subtitleParts = <String>[];
    if (todo.dueDate != null) {
      subtitleParts.add('截止 ${todo.dueDate!.month}/${todo.dueDate!.day}');
    }
    if (assigneeName != null) subtitleParts.add(assigneeName!);
    if (todo.notes != null && todo.notes!.isNotEmpty) subtitleParts.add(todo.notes!);

    return Card(
      child: ListTile(
        leading: Checkbox(value: todo.done, onChanged: (v) => onToggleDone(v ?? false)),
        title: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(color: _priorityColor(context), shape: BoxShape.circle),
            ),
            Expanded(
              child: Text(
                todo.title,
                style: TextStyle(
                  decoration: todo.done ? TextDecoration.lineThrough : null,
                  color: todo.done ? scheme.onSurface.withValues(alpha: 0.5) : null,
                ),
              ),
            ),
          ],
        ),
        subtitle: subtitleParts.isEmpty
            ? null
            : Text(
                subtitleParts.join(' · '),
                style: TextStyle(color: _isOverdue ? scheme.error : null),
              ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(icon: const Icon(Icons.edit_outlined, size: 18), onPressed: onEdit),
            IconButton(icon: const Icon(Icons.delete_outline, size: 18), onPressed: onDelete),
          ],
        ),
      ),
    );
  }
}
