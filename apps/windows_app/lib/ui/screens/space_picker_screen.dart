import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models/app_user.dart';
import '../../core/theme/app_accents.dart';
import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';
import 'admin/admin_home_screen.dart';

class SpacePickerScreen extends ConsumerWidget {
  const SpacePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spacesAsync = ref.watch(mySpacesProvider);
    final session = ref.watch(authControllerProvider).value;
    final brightness = Theme.of(context).colorScheme.brightness;

    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(gradient: AppGradients.dawn(brightness)),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 16, 8),
                child: Row(
                  children: [
                    Text(
                      session != null ? '你好，${session.user.name}' : '選擇空間',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Spacer(),
                    if (session?.user.isPlatformAdmin ?? false)
                      IconButton(
                        tooltip: '平台管理後台',
                        icon: const Icon(Icons.admin_panel_settings_outlined),
                        onPressed: () => Navigator.of(
                          context,
                        ).push(MaterialPageRoute(builder: (_) => const AdminHomeScreen())),
                      ),
                    IconButton(
                      tooltip: '登出',
                      icon: const Icon(Icons.logout),
                      onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: spacesAsync.when(
                    data: (spaces) {
                      final hasCalendar = spaces.any((s) => s.type == SpaceType.calendar);
                      return Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 16,
                        runSpacing: 16,
                        children: [
                          for (final space in spaces)
                            _SpaceCard(
                              space: space,
                              onTap: () => ref.read(selectedSpaceProvider.notifier).select(space),
                            ),
                          if (!hasCalendar)
                            _CreateCalendarSpaceCard(
                              onTap: () async {
                                try {
                                  final space = await ref
                                      .read(apiClientProvider)
                                      .getOrCreateCalendarSpace();
                                  ref.invalidate(mySpacesProvider);
                                  ref.read(selectedSpaceProvider.notifier).select(space);
                                } on ApiException catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(
                                      context,
                                    ).showSnackBar(SnackBar(content: Text(e.message)));
                                  }
                                }
                              },
                            ),
                        ],
                      );
                    },
                    loading: () => const CircularProgressIndicator(),
                    error: (error, _) => Text('讀取空間失敗：$error'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SpaceCard extends StatelessWidget {
  const _SpaceCard({required this.space, required this.onTap});

  final SpaceSummary space;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tint = switch (space.type) {
      SpaceType.personal => AppAccents.personal(scheme.brightness),
      SpaceType.calendar => AppAccents.calendar(scheme.brightness),
      SpaceType.company => AppAccents.company(scheme.brightness),
    };

    return SizedBox(
      width: 180,
      height: 140,
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(10)),
                  alignment: Alignment.center,
                  child: Icon(
                    switch (space.type) {
                      SpaceType.personal => Icons.person_outline,
                      SpaceType.calendar => Icons.calendar_today_outlined,
                      SpaceType.company => Icons.apartment,
                    },
                    size: 18,
                    color: scheme.onSurface,
                  ),
                ),
                const Spacer(),
                Text(
                  space.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 2),
                Text(
                  switch (space.type) {
                    SpaceType.personal => '個人空間',
                    SpaceType.calendar => '行事曆空間',
                    SpaceType.company => '公司空間 · ${space.role}',
                  },
                  style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CreateCalendarSpaceCard extends StatelessWidget {
  const _CreateCalendarSpaceCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SizedBox(
      width: 180,
      height: 140,
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.add, size: 18, color: scheme.onSurface.withValues(alpha: 0.7)),
                ),
                const Spacer(),
                const Text('新增行事曆', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 2),
                Text(
                  '建立你的行事曆空間',
                  style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
