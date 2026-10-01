import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../screens/health/health_screen.dart';
import 'space_switcher_list.dart';

const _sidebarWidth = 220.0;

/// Top-level shell for 健康 — same account-level sibling of `SpaceShell`
/// as `LifeGoalsShell`, with the same `SpaceSwitcherList`
/// sidebar so it's never a dead end.
class HealthShell extends ConsumerWidget {
  const HealthShell({super.key});

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
                      child: SpaceSwitcherList(healthSelected: true),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const Expanded(child: HealthScreen()),
        ],
      ),
    );
  }
}
