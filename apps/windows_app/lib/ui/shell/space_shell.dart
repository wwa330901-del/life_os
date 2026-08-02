import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../state/space_provider.dart';
import '../screens/approvals/approvals_home_screen.dart';
import '../screens/calendar/calendar_screen.dart';
import '../screens/projects/project_detail_screen.dart';
import '../screens/projects/project_list_screen.dart';
import '../screens/space/space_properties_screen.dart';
import 'app_sidebar.dart';
import 'dashboard_view.dart';

/// The persistent desktop shell for a selected space: a fixed left sidebar
/// (space switcher, module nav, logout) beside a content pane that swaps
/// between project list / project detail via plain local state — no
/// `Navigator.push`, matching the state-driven pattern `_RootRouter`
/// (`app.dart`) already uses one level up for login/space-picker/here.
///
/// 知識庫 is NOT reachable from here — it's account-level, not scoped to any
/// Space, so it's a sibling top-level destination (`KnowledgeShell`) reached
/// directly from the space picker instead of nested in this sidebar.
///
/// A company space goes straight to its project list — with only one real
/// module so far, a dashboard step in between was just an extra click to
/// the only place it could lead. Re-introduce a dashboard chooser if/when
/// a second module exists.
class SpaceShell extends ConsumerStatefulWidget {
  const SpaceShell({super.key});

  @override
  ConsumerState<SpaceShell> createState() => _SpaceShellState();
}

class _SpaceShellState extends ConsumerState<SpaceShell> {
  String? _openProjectId;
  bool _showPropertiesSettings = false;
  bool _showApprovals = false;

  void _backToList() => setState(() {
    _openProjectId = null;
    _showPropertiesSettings = false;
    _showApprovals = false;
  });

  void _openPropertiesSettings() => setState(() {
    _openProjectId = null;
    _showPropertiesSettings = true;
    _showApprovals = false;
  });

  void _openApprovals() => setState(() {
    _openProjectId = null;
    _showPropertiesSettings = false;
    _showApprovals = true;
  });

  @override
  Widget build(BuildContext context) {
    final space = ref.watch(selectedSpaceProvider);
    // `_RootRouter` only ever builds this widget once a space is selected.
    if (space == null) return const SizedBox.shrink();

    final content = switch (space.type) {
      SpaceType.personal => DashboardView(space: space),
      SpaceType.calendar => CalendarScreen(space: space),
      SpaceType.company when _showPropertiesSettings => SpacePropertiesScreen(
        spaceId: space.id,
        onBack: _backToList,
      ),
      SpaceType.company when _showApprovals => const ApprovalsHomeScreen(),
      SpaceType.company when _openProjectId != null => ProjectDetailScreen(
        projectId: _openProjectId!,
        spaceName: space.name,
        onBackToList: _backToList,
      ),
      SpaceType.company => ProjectListScreen(
        spaceId: space.id,
        spaceName: space.name,
        onOpenProject: (id) => setState(() => _openProjectId = id),
      ),
    };

    return Scaffold(
      body: Row(
        children: [
          AppSidebar(
            space: space,
            onGoToProjects: _backToList,
            onOpenPropertiesSettings: _openPropertiesSettings,
            propertiesSettingsSelected: _showPropertiesSettings,
            onOpenApprovals: _openApprovals,
            approvalsSelected: _showApprovals,
          ),
          Expanded(child: content),
        ],
      ),
    );
  }
}
