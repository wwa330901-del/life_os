import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/todo/todo_home_screen.dart';
import 'space_switcher_list.dart';

const _sidebarWidth = 220.0;

/// Top-level shell for 代辦事項 — a sibling destination to `SpaceShell` and
/// `KnowledgeShell`, not something nested inside a project anymore: a todo
/// is either 個人 (owned directly by the user, no project) or 工作 (belongs
/// to a company-space project), so it doesn't make sense to live under any
/// one project's detail screen. Same `SpaceSwitcherList` sidebar as the
/// other two shells, for the same reason (see `KnowledgeShell`'s doc
/// comment) — never a dead end.
class TodoShell extends ConsumerWidget {
  const TodoShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: Row(
        children: [
          SizedBox(
            width: _sidebarWidth,
            child: Container(
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
                border: Border(right: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
              ),
              child: SafeArea(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 8, 12),
                      child: Text(
                        '元序',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: SpaceSwitcherList(todoSelected: true),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const Expanded(child: TodoHomeScreen()),
        ],
      ),
    );
  }
}
