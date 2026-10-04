import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_accents.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/app_themes.dart';
import 'state/app_theme_provider.dart';
import 'state/ai_assistant_provider.dart';
import 'state/auth_provider.dart';
import 'state/divination_provider.dart';
import 'state/journal_provider.dart';
import 'state/knowledge_provider.dart';
import 'state/life_goal_provider.dart';
import 'state/space_provider.dart';
import 'state/todo_provider.dart';
import 'state/update_provider.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/space_picker_screen.dart';
import 'ui/shell/ai_assistant_shell.dart';
import 'ui/shell/divination_shell.dart';
import 'ui/shell/journal_shell.dart';
import 'ui/shell/trips_shell.dart';
import 'state/trip_provider.dart';
import 'ui/shell/knowledge_shell.dart';
import 'ui/shell/life_goals_shell.dart';
import 'ui/shell/space_shell.dart';
import 'ui/shell/todo_shell.dart';
import 'ui/widgets/update_dialog.dart';

class LifeOsApp extends ConsumerWidget {
  const LifeOsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 登入（或重新整理使用者資料）後，套用伺服器上記的外觀風格
    ref.listen(authControllerProvider, (_, next) {
      ref.read(appThemeProvider.notifier).applyFromServer(next.value?.user.appTheme);
    });
    final spec = themeById(ref.watch(appThemeProvider));
    AppAccents.spec = spec;
    return MaterialApp(
      title: '元序',
      theme: AppTheme.fromSpec(spec),
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
    if (ref.watch(showLifeGoalsProvider)) {
      return const LifeGoalsShell();
    }
    if (ref.watch(showJournalProvider)) {
      return const JournalShell();
    }
    if (ref.watch(showTripsProvider)) {
      return const TripsShell();
    }
    if (ref.watch(showDivinationProvider)) {
      return const DivinationShell();
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
