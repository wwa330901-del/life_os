import 'package:flutter/material.dart';

/// Shared placeholder for the project-detail tabs that don't have real
/// content yet (金額/合約條件/發包狀態/成本控制/專案成員) — the navigation shape
/// exists now so each can be filled in independently later.
class ComingSoonTab extends StatelessWidget {
  const ComingSoonTab({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.hourglass_empty, size: 40, color: scheme.outline),
          const SizedBox(height: 16),
          Text('$label — 即將推出', style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}
