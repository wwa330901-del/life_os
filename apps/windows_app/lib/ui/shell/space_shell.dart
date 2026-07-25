import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../state/space_provider.dart';
import '../screens/projects/project_detail_screen.dart';
import '../screens/projects/project_list_screen.dart';
import 'app_sidebar.dart';
import 'dashboard_view.dart';

/// The persistent desktop shell for a selected space: a fixed left sidebar
/// (space switcher, module nav, logout) beside a content pane that swaps
/// between project list / project detail via plain local state — no
/// `Navigator.push`, matching the state-driven pattern `_RootRouter`
/// (`app.dart`) already uses one level up for login/space-picker/here.
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

  void _backToList() => setState(() => _openProjectId = null);

  @override
  Widget build(BuildContext context) {
    final space = ref.watch(selectedSpaceProvider);
    // `_RootRouter` only ever builds this widget once a space is selected.
    if (space == null) return const SizedBox.shrink();

    final content = space.type != SpaceType.company
        ? DashboardView(space: space)
        : _openProjectId == null
        ? ProjectListScreen(
            spaceId: space.id,
            spaceName: space.name,
            onOpenProject: (id) => setState(() => _openProjectId = id),
          )
        : ProjectDetailScreen(
            projectId: _openProjectId!,
            spaceName: space.name,
            onBackToList: _backToList,
          );

    return Scaffold(
      body: Row(
        children: [
          AppSidebar(space: space, onGoToProjects: _backToList),
          Expanded(child: content),
        ],
      ),
    );
  }
}
