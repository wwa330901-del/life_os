import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../state/space_provider.dart';
import '../screens/approvals/approvals_home_screen.dart';
import '../screens/calendar/calendar_screen.dart';
import '../screens/projects/project_detail_screen.dart';
import '../screens/projects/project_list_screen.dart';
import '../screens/projects/tabs/engineering_finance/vendor_management_screen.dart';
import '../screens/space/client_management_screen.dart';
import '../screens/space/dashboard_screen.dart';
import '../screens/space/department_permissions_screen.dart';
import '../screens/space/my_workspace_screen.dart';
import '../screens/space/petty_cash_screen.dart';
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
class SpaceShell extends ConsumerStatefulWidget {
  const SpaceShell({super.key});

  @override
  ConsumerState<SpaceShell> createState() => _SpaceShellState();
}

class _SpaceShellState extends ConsumerState<SpaceShell> {
  String? _openProjectId;
  bool _showPropertiesSettings = false;
  bool _showApprovals = false;
  bool _showVendors = false;
  bool _showClients = false;
  bool _showPermissions = false;
  bool _showPettyCash = false;
  bool _showMyWorkspace = false;
  bool _showDashboard = false;

  // `_RootRouter` reuses this same `SpaceShell` widget instance across
  // every space (it's `const SpaceShell()` regardless of which one is
  // selected) — so switching from one company space's project straight to
  // a different company space via the sidebar re-runs build() with a new
  // `space`, but these local fields would otherwise keep pointing at the
  // old space's project/screen. Track which space they belong to and
  // reset on mismatch (2026-08-03 bug: clicking another company space
  // while inside a project didn't navigate away).
  String? _stateForSpaceId;

  void _resetScreenFlags() {
    _showPropertiesSettings = false;
    _showApprovals = false;
    _showVendors = false;
    _showClients = false;
    _showPermissions = false;
    _showPettyCash = false;
    _showMyWorkspace = false;
    _showDashboard = false;
  }

  void _backToList() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
  });

  void _openPropertiesSettings() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showPropertiesSettings = true;
  });

  void _openApprovals() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showApprovals = true;
  });

  void _openVendors() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showVendors = true;
  });

  void _openClients() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showClients = true;
  });

  void _openPermissions() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showPermissions = true;
  });

  void _openPettyCash() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showPettyCash = true;
  });

  void _openMyWorkspace() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showMyWorkspace = true;
  });

  void _openDashboard() => setState(() {
    _openProjectId = null;
    _resetScreenFlags();
    _showDashboard = true;
  });

  @override
  Widget build(BuildContext context) {
    final space = ref.watch(selectedSpaceProvider);
    // `_RootRouter` only ever builds this widget once a space is selected.
    if (space == null) return const SizedBox.shrink();

    if (space.id != _stateForSpaceId) {
      _stateForSpaceId = space.id;
      _openProjectId = null;
      _resetScreenFlags();
    }

    final content = switch (space.type) {
      SpaceType.personal => DashboardView(space: space),
      SpaceType.calendar => CalendarScreen(space: space),
      SpaceType.company when _showPropertiesSettings => SpacePropertiesScreen(
        spaceId: space.id,
        onBack: _backToList,
      ),
      SpaceType.company when _showApprovals => const ApprovalsHomeScreen(),
      SpaceType.company when _showVendors => VendorManagementScreen(spaceId: space.id),
      SpaceType.company when _showClients => ClientManagementScreen(spaceId: space.id),
      SpaceType.company when _showPermissions => DepartmentPermissionsScreen(
        spaceId: space.id,
        onBack: _backToList,
      ),
      SpaceType.company when _showPettyCash => PettyCashScreen(spaceId: space.id),
      SpaceType.company when _showMyWorkspace => MyWorkspaceScreen(spaceId: space.id),
      SpaceType.company when _showDashboard => DashboardScreen(spaceId: space.id),
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
            onOpenVendors: _openVendors,
            vendorsSelected: _showVendors,
            onOpenClients: _openClients,
            clientsSelected: _showClients,
            onOpenPermissions: _openPermissions,
            permissionsSelected: _showPermissions,
            onOpenPettyCash: _openPettyCash,
            pettyCashSelected: _showPettyCash,
            onOpenMyWorkspace: _openMyWorkspace,
            myWorkspaceSelected: _showMyWorkspace,
            onOpenDashboard: _openDashboard,
            dashboardSelected: _showDashboard,
          ),
          Expanded(child: content),
        ],
      ),
    );
  }
}
