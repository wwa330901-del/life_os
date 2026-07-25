import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../core/theme/app_accents.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';

/// Persistent left navigation for a selected space — replaces the old
/// "swap space" icon buried in `home_screen.dart`'s header with a always-
/// visible rail, so switching space or module doesn't require backing out
/// of whatever screen you're on.
class AppSidebar extends ConsumerWidget {
  const AppSidebar({super.key, required this.space, required this.onGoToProjects});

  final SpaceSummary space;
  final VoidCallback onGoToProjects;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final session = ref.watch(authControllerProvider).value;
    final tint = space.type == SpaceType.personal
        ? AppAccents.personal(scheme.brightness)
        : AppAccents.company(scheme.brightness);

    return Container(
      width: 220,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        border: Border(right: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
      ),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Text(
                '元序',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => ref.read(selectedSpaceProvider.notifier).clear(),
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(8)),
                        alignment: Alignment.center,
                        child: Icon(
                          space.type == SpaceType.personal ? Icons.person_outline : Icons.apartment,
                          size: 16,
                          color: scheme.onSurface,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          space.name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        ),
                      ),
                      Icon(Icons.swap_horiz, size: 16, color: scheme.onSurface.withValues(alpha: 0.5)),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (space.type == SpaceType.company)
              _NavItem(
                icon: Icons.view_timeline_outlined,
                label: '專案管理',
                selected: true,
                onTap: onGoToProjects,
              ),
            const Spacer(),
            Divider(height: 1, color: scheme.outline.withValues(alpha: 0.25)),
            _NavItem(
              icon: Icons.logout,
              label: session?.user.name ?? '登出',
              selected: false,
              onTap: () => ref.read(authControllerProvider.notifier).logout(),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: selected ? scheme.primary.withValues(alpha: 0.14) : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Row(
              children: [
                Icon(icon, size: 18, color: selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.7)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.85),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
