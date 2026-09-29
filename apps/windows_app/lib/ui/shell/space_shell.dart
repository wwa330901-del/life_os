import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../state/space_provider.dart';
import '../screens/calendar/calendar_screen.dart';
import 'app_sidebar.dart';
import 'dashboard_view.dart';

/// The persistent desktop shell for a selected space: a fixed left sidebar
/// (space switcher, logout) beside a content pane — no `Navigator.push`,
/// matching the state-driven pattern `_RootRouter` (`app.dart`) already
/// uses one level up for login/space-picker/here.
///
/// 知識庫 is NOT reachable from here — it's account-level, not scoped to any
/// Space, so it's a sibling top-level destination (`KnowledgeShell`) reached
/// directly from the space picker instead of nested in this sidebar.
class SpaceShell extends ConsumerWidget {
  const SpaceShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final space = ref.watch(selectedSpaceProvider);
    // `_RootRouter` only ever builds this widget once a space is selected.
    if (space == null) return const SizedBox.shrink();

    final content = switch (space.type) {
      SpaceType.personal => DashboardView(space: space),
      SpaceType.calendar => CalendarScreen(space: space),
    };

    return Scaffold(
      body: Row(
        children: [AppSidebar(space: space), Expanded(child: content)],
      ),
    );
  }
}
