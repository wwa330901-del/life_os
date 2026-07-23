import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final space = ref.watch(selectedSpaceProvider);
    final session = ref.watch(authControllerProvider).value;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: Column(
        children: [
          DecoratedBox(
            decoration: const BoxDecoration(gradient: AppGradients.homecoming),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        IconButton(
                          tooltip: '切換空間',
                          icon: const Icon(Icons.swap_horiz),
                          onPressed: () => ref.read(selectedSpaceProvider.notifier).clear(),
                        ),
                        const Spacer(),
                        IconButton(
                          tooltip: '登出',
                          icon: const Icon(Icons.logout),
                          onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      space?.name ?? '元序',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${session?.user.name ?? ''} 已登入',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_circle, size: 40, color: scheme.primary),
                  const SizedBox(height: 16),
                  Text(
                    '這裡之後會放這個空間的首頁卡片與模組導航。',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
