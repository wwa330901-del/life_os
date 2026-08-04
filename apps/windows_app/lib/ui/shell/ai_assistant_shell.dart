import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/ai_assistant/ai_assistant_screen.dart';
import 'space_switcher_list.dart';

const _sidebarWidth = 220.0;

/// Top-level shell for AI 問答 — a sibling destination to `SpaceShell`,
/// `KnowledgeShell`, and `TodoShell`, not nested inside any one Space (the
/// assistant can answer across every space the user has, so it doesn't
/// belong to just one). Same `SpaceSwitcherList` sidebar as the other
/// three shells, for the same reason (never a dead end).
class AiAssistantShell extends ConsumerWidget {
  const AiAssistantShell({super.key});

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
                      child: SpaceSwitcherList(aiAssistantSelected: true),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const Expanded(child: AiAssistantScreen()),
        ],
      ),
    );
  }
}
