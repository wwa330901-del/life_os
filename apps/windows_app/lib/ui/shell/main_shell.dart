import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_user.dart';
import '../../state/app_layout_provider.dart';
import '../../state/auth_provider.dart';
import '../../state/navigation_provider.dart';
import '../../state/space_provider.dart';
import '../screens/ai_assistant/ai_assistant_screen.dart';
import '../screens/calendar/calendar_screen.dart';
import '../screens/divination/divination_screen.dart';
import '../screens/finance/finance_home_screen.dart';
import '../screens/home/home_screens.dart';
import '../screens/journal/journal_screen.dart';
import '../screens/knowledge/knowledge_home_screen.dart';
import '../screens/life_goals/life_goals_home_screen.dart';
import '../screens/stocks/stocks_home_screen.dart';
import '../screens/todo/todo_home_screen.dart';
import '../screens/trips/trips_screen.dart';
import '../widgets/error_panel.dart';
import 'settings_actions.dart';

/// 登入後的整個 App（2026-11-22）：拿掉「空間」，依使用者選的版面排：
/// - cards／ai：首頁是全畫面，進功能後上面有「回首頁」
/// - sidebar：左邊固定一排選單，到哪都只要點一下
class MainShell extends ConsumerWidget {
  const MainShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layout = ref.watch(appLayoutProvider);
    final destination = ref.watch(navProvider);

    if (layout == AppLayout.sidebar) {
      return Scaffold(
        body: Row(
          children: [
            const MainNavSidebar(),
            Expanded(
              child: destination == AppDestination.home ? const HomeSidebar() : DestinationContent(destination: destination),
            ),
          ],
        ),
      );
    }

    if (destination == AppDestination.home) {
      return layout == AppLayout.ai ? const HomeAi() : const HomeCards();
    }
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _BackBar(destination: destination),
            Expanded(child: DestinationContent(destination: destination)),
          ],
        ),
      ),
    );
  }
}

/// A、C 版進到功能後最上面那條：「‹ 回首頁」＋功能名稱。
class _BackBar extends ConsumerWidget {
  const _BackBar({required this.destination});

  final AppDestination destination;

  /// 這幾個畫面自己有標題列，這裡就不再寫一次名稱。
  static const _hasOwnTitle = {AppDestination.aiAssistant, AppDestination.divination, AppDestination.journal};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 6, 16, 6),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.2)))),
      child: Row(
        children: [
          TextButton.icon(
            onPressed: () => ref.read(navProvider.notifier).home(),
            icon: const Icon(Icons.chevron_left),
            label: const Text('回首頁'),
          ),
          const SizedBox(width: 8),
          if (!_hasOwnTitle.contains(destination))
            Text(destination.label, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// 每個功能實際的畫面。記帳／股票用個人的記帳資料（以前叫「個人空間」），行事曆用行事曆資料。
class DestinationContent extends ConsumerWidget {
  const DestinationContent({super.key, required this.destination});

  final AppDestination destination;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    switch (destination) {
      case AppDestination.home:
        return const SizedBox.shrink();
      case AppDestination.todo:
        return const TodoHomeScreen();
      case AppDestination.lifeGoals:
        return const LifeGoalsHomeScreen();
      case AppDestination.journal:
        return const JournalScreen();
      case AppDestination.trips:
        return const TripsScreen();
      case AppDestination.knowledge:
        return const KnowledgeHomeScreen();
      case AppDestination.divination:
        return const DivinationScreen();
      case AppDestination.aiAssistant:
        return const AiAssistantScreen();
      case AppDestination.finance:
      case AppDestination.stocks:
      case AppDestination.calendar:
        break;
    }
    final spacesAsync = ref.watch(mySpacesProvider);
    return spacesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => ErrorPanel(error: error, onRetry: () => ref.invalidate(mySpacesProvider)),
      data: (spaces) {
        if (destination == AppDestination.calendar) {
          return _CalendarDestination(spaces: spaces.where((s) => s.type == SpaceType.calendar).toList());
        }
        final personal = spaces.where((s) => s.type == SpaceType.personal).firstOrNull;
        if (personal == null) return const Center(child: Text('找不到你的記帳資料，請重新登入一次'));
        return destination == AppDestination.finance
            ? FinanceHomeScreen(spaceId: personal.id)
            : StocksHomeScreen(spaceId: personal.id);
      },
    );
  }
}

/// 行事曆：還沒有就給「建立行事曆」；有好幾本（例如別人分享的）就上面可以切換。
class _CalendarDestination extends ConsumerStatefulWidget {
  const _CalendarDestination({required this.spaces});

  final List<SpaceSummary> spaces;

  @override
  ConsumerState<_CalendarDestination> createState() => _CalendarDestinationState();
}

class _CalendarDestinationState extends ConsumerState<_CalendarDestination> {
  String? _selectedId;
  bool _creating = false;

  Future<void> _create() async {
    setState(() => _creating = true);
    try {
      await ref.read(apiClientProvider).getOrCreateCalendarSpace();
      ref.invalidate(mySpacesProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e));
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final spaces = widget.spaces;
    if (spaces.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('還沒有行事曆'),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _creating ? null : _create,
              icon: const Icon(Icons.add),
              label: const Text('建立行事曆'),
            ),
          ],
        ),
      );
    }
    final selected = spaces.where((s) => s.id == _selectedId).firstOrNull ?? spaces.first;
    final calendar = CalendarScreen(key: ValueKey(selected.id), space: selected);
    if (spaces.length == 1) return calendar;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Wrap(
            spacing: 8,
            children: [
              for (final s in spaces)
                ChoiceChip(
                  label: Text(s.name),
                  selected: s.id == selected.id,
                  onSelected: (_) => setState(() => _selectedId = s.id),
                ),
            ],
          ),
        ),
        Expanded(child: calendar),
      ],
    );
  }
}

/// B 版左邊的選單：常用的在上面、少用的放「其他」、設定在最下面。
class MainNavSidebar extends ConsumerWidget {
  const MainNavSidebar({super.key});

  static const _main = [
    AppDestination.home,
    AppDestination.finance,
    AppDestination.stocks,
    AppDestination.calendar,
    AppDestination.todo,
    AppDestination.lifeGoals,
    AppDestination.aiAssistant,
  ];
  static const _other = [AppDestination.journal, AppDestination.trips, AppDestination.knowledge, AppDestination.divination];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final current = ref.watch(navProvider);

    Widget item(AppDestination d, {bool small = false}) {
      final selected = d == current;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 1),
        child: Material(
          color: selected ? scheme.secondaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => ref.read(navProvider.notifier).go(d),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: small ? 8 : 11),
              child: Row(
                children: [
                  Icon(d.icon, size: small ? 18 : 20, color: selected ? scheme.onSecondaryContainer : scheme.onSurfaceVariant),
                  const SizedBox(width: 12),
                  Text(
                    d == AppDestination.home ? '今天' : d.label,
                    style: TextStyle(
                      fontSize: small ? 14 : 15,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                      color: selected ? scheme.onSecondaryContainer : null,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      width: 220,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        border: Border(right: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: Text('元序', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
              ),
              Expanded(
                child: ListView(
                  children: [
                    for (final d in _main) item(d),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 14, 12, 4),
                      child: Text('其他', style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                    ),
                    for (final d in _other) item(d, small: true),
                  ],
                ),
              ),
              PopupMenuButton<SettingsAction>(
                tooltip: '設定',
                onSelected: (a) => a.onTap(),
                itemBuilder: (_) => [
                  for (final a in settingsActions(context, ref))
                    PopupMenuItem(
                      value: a,
                      child: Row(children: [Icon(a.icon, size: 18), const SizedBox(width: 12), Text(a.label)]),
                    ),
                ],
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(
                    children: [
                      Icon(Icons.settings_outlined, size: 20, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 12),
                      const Text('設定'),
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
}
