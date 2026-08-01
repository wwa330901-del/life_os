import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../screens/finance/finance_home_screen.dart';
import '../screens/stocks/stocks_home_screen.dart';

/// Content pane for a personal space — 個人功能 modules, switched by a
/// top-level tab bar: 記帳 (FinanceHomeScreen) and 投資 (StocksHomeScreen),
/// each owning its own internal sub-tabs. Company spaces skip this entirely
/// and go straight to the project list (`SpaceShell`).
class DashboardView extends ConsumerStatefulWidget {
  const DashboardView({super.key, required this.space});

  final SpaceSummary space;

  @override
  ConsumerState<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends ConsumerState<DashboardView> with SingleTickerProviderStateMixin {
  late final TabController _moduleTabController = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _moduleTabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
                Text(widget.space.name, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 4),
                Text(
                  '${session?.user.name ?? ''} 已登入',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
        TabBar(
          controller: _moduleTabController,
          tabs: const [
            Tab(text: '記帳'),
            Tab(text: '投資'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _moduleTabController,
            children: [
              FinanceHomeScreen(spaceId: widget.space.id),
              StocksHomeScreen(spaceId: widget.space.id),
            ],
          ),
        ),
      ],
    );
  }
}
