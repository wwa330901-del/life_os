import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'state/auth_provider.dart';
import 'state/space_provider.dart';
import 'ui/screens/home_screen.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/space_picker_screen.dart';

class LifeOsApp extends ConsumerWidget {
  const LifeOsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'life_os',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF3B82F6), useMaterial3: true),
      home: const _RootRouter(),
    );
  }
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

    final selectedSpace = ref.watch(selectedSpaceProvider);
    if (selectedSpace == null) {
      return const SpacePickerScreen();
    }

    return const HomeScreen();
  }
}
