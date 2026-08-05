import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project_todo.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/todo_provider.dart';
import '../todo_tile.dart';

/// 已完成代辦事項 — full history, 個人＋工作合併，因為那兩個分頁只會保留完成當天
/// 的項目（見 `TodosService.listAll`），這裡才是完成過的東西真正找得到的地方：
/// 依完成時間新到舊分頁（10 筆一頁）、可搜尋標題。
class CompletedTodoTab extends ConsumerStatefulWidget {
  const CompletedTodoTab({super.key});

  @override
  ConsumerState<CompletedTodoTab> createState() => _CompletedTodoTabState();
}

class _CompletedTodoTabState extends ConsumerState<CompletedTodoTab> {
  String _search = '';
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels < _scrollController.position.maxScrollExtent - 200) return;
    ref.read(completedTodosProvider(_query).notifier).loadMore();
  }

  CompletedTodosQuery get _query => (search: _search.isEmpty ? null : _search);

  @override
  Widget build(BuildContext context) {
    final pageAsync = ref.watch(completedTodosProvider(_query));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: const InputDecoration(
              labelText: '搜尋已完成事項',
              isDense: true,
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) => setState(() => _search = value),
          ),
        ),
        Expanded(
          child: pageAsync.when(
            data: (page) {
              if (page.items.isEmpty) {
                return const Center(child: Text('沒有已完成的代辦事項'));
              }
              return ListView.separated(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: page.items.length + (page.hasMore ? 1 : 0),
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  if (index >= page.items.length) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final entry = page.items[index];
                  return TodoTile(
                    todo: entry.todo,
                    contextLabel: entry.projectName != null ? '${entry.projectName}（${entry.spaceName}）' : '個人',
                    onToggleDone: (done) => _toggleDone(context, ref, entry.todo, done),
                    onEdit: null,
                    onDelete: () => _delete(context, ref, entry.todo),
                  );
                },
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('讀取失敗：$error')),
          ),
        ),
      ],
    );
  }

  Future<void> _toggleDone(BuildContext context, WidgetRef ref, ProjectTodo todo, bool done) async {
    try {
      await ref.read(apiClientProvider).updateTodo(todoId: todo.id, done: done);
      ref.invalidate(completedTodosProvider);
      ref.invalidate(todoOverviewProvider);
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
      await ref.read(apiClientProvider).deleteTodo(todo.id);
      ref.invalidate(completedTodosProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
