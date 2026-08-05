import 'package:flutter/material.dart';

import '../../../core/models/project_todo.dart';

/// Shared row widget for both 個人 and 工作 todo lists — same look the old
/// per-project tab used, with `assigneeName` simply omitted for 個人 items
/// (they have no assignee concept).
class TodoTile extends StatelessWidget {
  const TodoTile({
    super.key,
    required this.todo,
    required this.onToggleDone,
    required this.onEdit,
    required this.onDelete,
    this.assigneeName,
    this.contextLabel,
  });

  final ProjectTodo todo;
  final String? assigneeName;

  /// 個人/工作 context this row belongs to — only set on the 已完成 history
  /// tab, where 個人 and 工作 items are flattened into one combined list and
  /// so need this to stay identifiable (personal/work's own tabs don't need
  /// it, they're already scoped to one context).
  final String? contextLabel;
  final ValueChanged<bool> onToggleDone;

  /// Null hides the edit button — the 已完成 history tab doesn't offer
  /// editing, only un-completing (via the checkbox) or deleting.
  final VoidCallback? onEdit;
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
    if (contextLabel != null) subtitleParts.add(contextLabel!);
    if (todo.isOngoing) {
      subtitleParts.add('持續性任務');
    } else if (todo.dueDate != null) {
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
