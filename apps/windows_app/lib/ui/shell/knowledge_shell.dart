import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/knowledge/knowledge_home_screen.dart';
import 'space_switcher_list.dart';

const _sidebarWidth = 220.0;

/// Top-level shell for 知識庫 — a sibling destination to `SpaceShell`, not
/// something nested inside it, since the knowledge library is account-level
/// and isn't scoped to any particular Space (see 大系統 doc). Shows the same
/// `SpaceSwitcherList` as `AppSidebar` so jumping directly to any space (or
/// back home) never requires detouring through the home screen first —
/// this was a real complaint: without it, 知識庫 was a dead end you could
/// only leave via 回首頁.
class KnowledgeShell extends ConsumerWidget {
  const KnowledgeShell({super.key});

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
                      child: SpaceSwitcherList(knowledgeSelected: true),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const Expanded(child: KnowledgeHomeScreen()),
        ],
      ),
    );
  }
}
