import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/app_user.dart';
import '../../../../core/models/project.dart';
import '../../../../core/models/project_member.dart';
import '../../../../core/models/project_todo.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_members_provider.dart';
import '../../../../state/projects_provider.dart';
import '../../../../state/space_provider.dart';
import '../../../../state/todo_provider.dart';
import '../todo_tile.dart';

/// 工作事項 — grouped by project, one section per project that already has
/// at least one todo. Adding one requires picking 公司 → 專案 first (a 工作
/// todo always belongs to some project; 個人事項 is the separate
/// no-project path, see `PersonalTodoTab`).
class WorkTodoTab extends ConsumerWidget {
  const WorkTodoTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overviewAsync = ref.watch(todoOverviewProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openCreateFlow(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('新增工作事項'),
      ),
      body: overviewAsync.when(
        data: (overview) {
          final groups = overview.work.where((g) => g.todos.isNotEmpty).toList();
          if (groups.isEmpty) {
            return const Center(child: Text('還沒有任何工作事項，點右下角新增一個吧'));
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            itemCount: groups.length,
            itemBuilder: (context, index) => _ProjectSection(group: groups[index]),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('讀取工作事項失敗：$error')),
      ),
    );
  }

  Future<void> _openCreateFlow(BuildContext context, WidgetRef ref) async {
    final target = await _pickCompanyAndProject(context);
    if (target == null || !context.mounted) return;
    await _openEditor(context, ref, projectId: target.$1, existing: null);
  }

  /// Returns (projectId, projectName) once both 公司 and 專案 are picked, or
  /// null if the user backs out.
  static Future<(String, String)?> _pickCompanyAndProject(BuildContext context) {
    return showDialog<(String, String)>(
      context: context,
      builder: (context) => const _CompanyProjectPickerDialog(),
    );
  }

  static Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref, {
    required String projectId,
    required ProjectTodo? existing,
  }) => showTodoFormDialog(context, ref, projectId: projectId, existing: existing);
}

class _CompanyProjectPickerDialog extends ConsumerStatefulWidget {
  const _CompanyProjectPickerDialog();

  @override
  ConsumerState<_CompanyProjectPickerDialog> createState() => _CompanyProjectPickerDialogState();
}

class _CompanyProjectPickerDialogState extends ConsumerState<_CompanyProjectPickerDialog> {
  String? _spaceId;
  String? _projectId;

  @override
  Widget build(BuildContext context) {
    final spaces = (ref.watch(mySpacesProvider).value ?? const <SpaceSummary>[])
        .where((s) => s.type == SpaceType.company)
        .toList();
    final projectsAsync = _spaceId == null ? null : ref.watch(spaceProjectsProvider(_spaceId!));

    return AlertDialog(
      title: const Text('新增工作事項'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (spaces.isEmpty)
              const Text('你目前不屬於任何公司空間。')
            else ...[
              DropdownButtonFormField<String>(
                initialValue: _spaceId,
                decoration: const InputDecoration(labelText: '公司'),
                items: [for (final s in spaces) DropdownMenuItem(value: s.id, child: Text(s.name))],
                onChanged: (value) => setState(() {
                  _spaceId = value;
                  _projectId = null;
                }),
              ),
              const SizedBox(height: 12),
              if (_spaceId != null)
                projectsAsync!.when(
                  data: (projects) {
                    if (projects.isEmpty) {
                      return const Text('這個公司空間還沒有任何專案。');
                    }
                    return DropdownButtonFormField<String>(
                      initialValue: _projectId,
                      decoration: const InputDecoration(labelText: '專案'),
                      items: [for (final p in projects) DropdownMenuItem(value: p.id, child: Text(p.name))],
                      onChanged: (value) => setState(() => _projectId = value),
                    );
                  },
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (error, _) => Text('讀取專案失敗：$error'),
                ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: _projectId == null
              ? null
              : () {
                  final projects = ref.read(spaceProjectsProvider(_spaceId!)).value ?? const <Project>[];
                  final project = projects.firstWhere((p) => p.id == _projectId);
                  Navigator.of(context).pop((project.id, project.name));
                },
          child: const Text('下一步'),
        ),
      ],
    );
  }
}

class _ProjectSection extends ConsumerWidget {
  const _ProjectSection({required this.group});

  final WorkProjectTodos group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final members = ref.watch(projectMembersProvider(group.projectId)).value ?? const <ProjectMember>[];
    final memberNameOf = {for (final m in members) m.userId: m.name};

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '${group.projectName}（${group.spaceName}）',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          for (final todo in group.todos)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: TodoTile(
                todo: todo,
                assigneeName: todo.assigneeUserId == null ? null : memberNameOf[todo.assigneeUserId],
                onToggleDone: (done) => _toggleDone(context, ref, todo, done),
                onEdit: () => showTodoFormDialog(context, ref, projectId: group.projectId, existing: todo),
                onDelete: () => _delete(context, ref, todo),
              ),
            ),
        ],
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
        title: const Text('刪除工作事項'),
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
}

/// Full form (title/due date/priority/notes/assignee) shared by "新增" (via
/// the 公司→專案 picker above) and "編輯" (from an existing tile).
Future<void> showTodoFormDialog(
  BuildContext context,
  WidgetRef ref, {
  required String projectId,
  required ProjectTodo? existing,
}) async {
  final members = ref.read(projectMembersProvider(projectId)).value ?? const <ProjectMember>[];
  final titleController = TextEditingController(text: existing?.title ?? '');
  final notesController = TextEditingController(text: existing?.notes ?? '');
  var dueDate = existing?.dueDate;
  // 每一筆代辦事項都必須是「有日期」或「持續性任務」二選一——沒有第三種
  // 「都不選」的狀態。
  var isOngoing = existing?.isOngoing ?? false;
  var priority = existing?.priority ?? TodoPriority.medium;
  var assigneeUserId = existing?.assigneeUserId;

  final saved = await showDialog<bool>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(existing == null ? '新增工作事項' : '編輯工作事項'),
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
                        labelText: '截止日',
                        suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
                      ),
                      child: Text(
                        dueDate == null ? '未設定' : '${dueDate!.year}/${dueDate!.month}/${dueDate!.day}',
                      ),
                    ),
                  ),
                ],
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
  final notes = notesController.text.trim();

  try {
    final api = ref.read(apiClientProvider);
    if (existing == null) {
      await api.createTodo(
        projectId: projectId,
        title: title,
        dueDate: dueDate,
        isOngoing: isOngoing,
        priority: priority,
        notes: notes.isEmpty ? null : notes,
        assigneeUserId: assigneeUserId,
      );
    } else {
      await api.updateTodo(
        todoId: existing.id,
        title: title,
        dueDate: dueDate,
        clearDueDate: dueDate == null,
        isOngoing: isOngoing,
        priority: priority,
        notes: notes.isEmpty ? null : notes,
        clearNotes: notes.isEmpty,
        assigneeUserId: assigneeUserId,
        clearAssignee: assigneeUserId == null,
      );
    }
    ref.invalidate(todoOverviewProvider);
  } on ApiException catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}
