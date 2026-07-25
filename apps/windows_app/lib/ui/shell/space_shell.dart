import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/space_provider.dart';
import '../screens/projects/project_detail_screen.dart';
import '../screens/projects/project_list_screen.dart';
import 'app_sidebar.dart';
import 'dashboard_view.dart';

/// The persistent desktop shell for a selected space: a fixed left sidebar
/// (space switcher, module nav, logout) beside a content pane that swaps
/// between dashboard / project list / project detail via plain local state
/// — no `Navigator.push`, matching the state-driven pattern `_RootRouter`
/// (`app.dart`) already uses one level up for login/space-picker/here.
class SpaceShell extends ConsumerStatefulWidget {
  const SpaceShell({super.key});

  @override
  ConsumerState<SpaceShell> createState() => _SpaceShellState();
}

class _SpaceShellState extends ConsumerState<SpaceShell> {
  String? _activeModule;
  String? _openProjectId;

  void _openModule(String module) {
    setState(() {
      _activeModule = module;
      _openProjectId = null;
    });
  }

  void _goToDashboard() {
    setState(() {
      _activeModule = null;
      _openProjectId = null;
    });
  }

  void _backToList() => setState(() => _openProjectId = null);

  @override
  Widget build(BuildContext context) {
    final space = ref.watch(selectedSpaceProvider);
    // `_RootRouter` only ever builds this widget once a space is selected.
    if (space == null) return const SizedBox.shrink();

    Widget content;
    if (_activeModule == 'projects') {
      content = _openProjectId == null
          ? ProjectListScreen(
              spaceId: space.id,
              spaceName: space.name,
              onBack: _goToDashboard,
              onOpenProject: (id) => setState(() => _openProjectId = id),
            )
          : ProjectDetailScreen(
              projectId: _openProjectId!,
              spaceName: space.name,
              onBackToDashboard: _goToDashboard,
              onBackToList: _backToList,
            );
    } else {
      content = DashboardView(space: space, onOpenModule: _openModule);
    }

    return Scaffold(
      body: Row(
        children: [
          AppSidebar(space: space, activeModule: _activeModule, onSelectModule: _openModule),
          Expanded(child: content),
        ],
      ),
    );
  }
}
