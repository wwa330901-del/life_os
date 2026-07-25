import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../../state/projects_provider.dart';

/// Content pane shown when no module is open — one live tile per module a
/// space actually has. Deliberately doesn't pad this out with disabled
/// placeholder tiles for modules that don't exist yet; a real product
/// showing unclickable "coming soon" chrome reads as padding, not scale.
class DashboardView extends ConsumerWidget {
  const DashboardView({super.key, required this.space, required this.onOpenModule});

  final SpaceSummary space;
  final ValueChanged<String> onOpenModule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).value;
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(gradient: AppGradients.homecoming(scheme.brightness)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(space.name, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 4),
                Text(
                  '${session?.user.name ?? ''} 已登入',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: space.type == SpaceType.company
              ? _CompanyDashboard(space: space, onOpenModule: onOpenModule)
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
    );
  }
}

class _CompanyDashboard extends ConsumerWidget {
  const _CompanyDashboard({required this.space, required this.onOpenModule});

  final SpaceSummary space;
  final ValueChanged<String> onOpenModule;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final projectsAsync = ref.watch(spaceProjectsProvider(space.id));
    final count = projectsAsync.value?.length;

    return Padding(
      padding: const EdgeInsets.all(28),
      child: GridView(
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 260,
          mainAxisExtent: 120,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        children: [
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => onOpenModule('projects'),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.view_timeline_outlined, color: scheme.primary),
                    const Spacer(),
                    const Text('專案管理', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(
                      count == null ? '工期、金額、合約與成本管理' : '$count 個專案',
                      style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
