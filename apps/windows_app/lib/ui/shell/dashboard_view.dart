import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../screens/finance/finance_home_screen.dart';

/// Content pane for a personal space — currently just the 記帳 module (the
/// first of what will eventually be several 個人功能). Company spaces skip
/// this entirely and go straight to the project list (`SpaceShell`).
class DashboardView extends ConsumerWidget {
  const DashboardView({super.key, required this.space});

  final SpaceSummary space;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).value;
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(gradient: AppGradients.homecoming(scheme.brightness)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(space.name, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 4),
                Text(
                  '${session?.user.name ?? ''} 已登入',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
        Expanded(child: FinanceHomeScreen(spaceId: space.id)),
      ],
    );
  }
}
