import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/models/app_user.dart';
import '../../core/models/home_dashboard.dart';
import '../../core/theme/app_accents.dart';
import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import '../../state/home_provider.dart';
import '../../state/space_provider.dart';
import 'admin/admin_home_screen.dart';
import 'home/home_dashboard_widgets.dart';

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
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // 空間卡片固定在最上方，不受版面自訂影響。
                      Center(
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
                      const SizedBox(height: 32),
                      Row(
                        children: [
                          Expanded(child: Text('首頁總覽', style: Theme.of(context).textTheme.titleLarge)),
                          TextButton.icon(
                            onPressed: () => _openLayoutEditor(context, ref),
                            icon: const Icon(Icons.tune, size: 16),
                            label: const Text('自訂版面'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const _HomeDashboardSection(),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openLayoutEditor(BuildContext context, WidgetRef ref) async {
    final layout = ref.read(homeLayoutProvider).value;
    if (layout == null) return;
    var working = [...layout];

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('自訂首頁版面'),
          content: SizedBox(
            width: 360,
            height: 320,
            child: ReorderableListView(
              onReorderItem: (oldIndex, newIndex) => setState(() {
                final item = working.removeAt(oldIndex);
                working.insert(newIndex, item);
              }),
              children: [
                for (final widgetConfig in working)
                  CheckboxListTile(
                    key: ValueKey(widgetConfig.type),
                    value: widgetConfig.visible,
                    title: Text(homeWidgetLabel(widgetConfig.type)),
                    controlAffinity: ListTileControlAffinity.leading,
                    onChanged: (checked) => setState(() {
                      final index = working.indexWhere((w) => w.type == widgetConfig.type);
                      working[index] = widgetConfig.copyWith(visible: checked ?? true);
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (saved != true) return;

    try {
      await ref.read(apiClientProvider).setHomeLayout(working);
      ref.invalidate(homeLayoutProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _HomeDashboardSection extends ConsumerWidget {
  const _HomeDashboardSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layoutAsync = ref.watch(homeLayoutProvider);
    final dashboardAsync = ref.watch(homeDashboardProvider);

    return layoutAsync.when(
      data: (layout) => dashboardAsync.when(
        data: (dashboard) {
          final widgets = layout
              .where((w) => w.visible)
              .map((w) => buildHomeWidget(context, w.type, dashboard))
              .whereType<Widget>()
              .toList();
          if (widgets.isEmpty) {
            return const Text('版面上目前沒有任何小工具，按右上角「自訂版面」開啟。');
          }
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: widgets);
        },
        loading: () => const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (error, _) => Text('讀取首頁資料失敗：$error'),
      ),
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Text('讀取版面設定失敗：$error'),
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
