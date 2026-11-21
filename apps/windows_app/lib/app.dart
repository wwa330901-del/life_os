import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_accents.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/app_themes.dart';
import 'state/app_theme_provider.dart';
import 'state/auth_provider.dart';
import 'state/update_provider.dart';
import 'state/app_layout_provider.dart';
import 'ui/screens/login_screen.dart';
import 'ui/shell/main_shell.dart';
import 'ui/widgets/update_dialog.dart';

/// 日期／時間選擇器、複製貼上選單這些 Flutter 內建介面用繁體中文。
const appLocale = Locale.fromSubtags(languageCode: 'zh', scriptCode: 'Hant', countryCode: 'TW');
const appLocalizationsDelegates = [
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

class LifeOsApp extends ConsumerWidget {
  const LifeOsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 登入（或重新整理使用者資料）後，套用伺服器上記的外觀風格
    ref.listen(authControllerProvider, (_, next) {
      ref.read(appThemeProvider.notifier).applyFromServer(next.value?.user.appTheme);
      ref.read(appLayoutProvider.notifier).applyFromServer(next.value?.user.appLayout);
    });
    final spec = themeById(ref.watch(appThemeProvider));
    AppAccents.spec = spec;
    return MaterialApp(
      title: '元序',
      theme: AppTheme.fromSpec(spec),
      locale: appLocale,
      supportedLocales: const [appLocale],
      localizationsDelegates: appLocalizationsDelegates,
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
    return const MainShell();
  }
}
