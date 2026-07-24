import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';
import 'projects/project_list_screen.dart';

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
            child: space?.type == SpaceType.company
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Card(
                        child: ListTile(
                          leading: Icon(Icons.view_timeline_outlined, color: scheme.primary),
                          title: const Text('專案管理'),
                          subtitle: const Text('工期、金額、合約與成本管理'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ProjectListScreen(
                                spaceId: space!.id,
                                spaceName: space.name,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  )
                : Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle, size: 40, color: scheme.primary),
                        const SizedBox(height: 16),
                        Text(
                          '個人空間的功能模組尚未推出。',
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
