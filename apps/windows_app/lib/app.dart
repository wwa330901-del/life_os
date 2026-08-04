import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'state/ai_assistant_provider.dart';
import 'state/auth_provider.dart';
import 'state/knowledge_provider.dart';
import 'state/space_provider.dart';
import 'state/todo_provider.dart';
import 'state/update_provider.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/space_picker_screen.dart';
import 'ui/shell/ai_assistant_shell.dart';
import 'ui/shell/knowledge_shell.dart';
import 'ui/shell/space_shell.dart';
import 'ui/shell/todo_shell.dart';
import 'ui/widgets/update_dialog.dart';

class LifeOsApp extends ConsumerWidget {
  const LifeOsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: '元序',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: const _AppShell(),
    );
  }
}

/// Runs once-per-launch startup checks (currently: update check) ahead of
/// whatever screen `_RootRouter` picks, independent of auth state.
class _AppShell extends ConsumerStatefulWidget {
  const _AppShell();

  @override
  ConsumerState<_AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<_AppShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
  }

  Future<void> _checkForUpdate() async {
    final info = await ref.read(updateServiceProvider).checkForUpdate();
    if (info != null && mounted) {
      showUpdateAvailableDialog(context, info);
    }
  }

  @override
  Widget build(BuildContext context) => const _RootRouter();
}

/// Decides which top-level screen to show based on auth + selected space.
/// This is intentionally the only place that branches on session state —
/// every screen below assumes it's already reachable only when allowed.
class _RootRouter extends ConsumerWidget {
  const _RootRouter();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);

    if (authState.isLoading && !authState.hasValue) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final session = authState.value;
    if (session == null) {
      return const LoginScreen();
    }

    if (ref.watch(showKnowledgeLibraryProvider)) {
      return const KnowledgeShell();
    }
    if (ref.watch(showTodoSpaceProvider)) {
      return const TodoShell();
    }
    if (ref.watch(showAiAssistantProvider)) {
      return const AiAssistantShell();
    }

    final selectedSpace = ref.watch(selectedSpaceProvider);
    if (selectedSpace == null) {
      return const SpacePickerScreen();
    }

    return const SpaceShell();
  }
}
