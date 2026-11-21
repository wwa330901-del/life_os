import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/home_dashboard.dart';
import '../../../core/theme/app_accents.dart';
import '../../../core/theme/app_theme.dart';
import '../../../state/auth_provider.dart';
import '../../../state/home_provider.dart';
import '../../../state/navigation_provider.dart';
import '../../shell/settings_actions.dart';
import '../finance/widgets/finance_format.dart';
import 'home_dashboard_section.dart';

String greeting(String? name) {
  final hour = DateTime.now().hour;
  final hello = hour < 11
      ? '早安'
      : hour < 18
      ? '午安'
      : '晚安';
  return name == null || name.isEmpty ? hello : '$hello，$name';
}

String todayLabel() {
  final now = DateTime.now();
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  return '${now.month} 月 ${now.day} 日 星期${weekdays[now.weekday - 1]}';
}

/// 功能卡片上的一句話：有今天的數字就顯示數字，沒有就顯示功能說明。
String destinationSubtitle(AppDestination d, HomeDashboard? dashboard) {
  switch (d) {
    case AppDestination.finance:
      final f = dashboard?.personalFinance;
      if (f != null) return '今天花 ${formatAmount(f.todayExpense)}';
    case AppDestination.todo:
      final n = dashboard?.todosToday.dueTodayIncomplete.length;
      if (n != null) return n == 0 ? '今天沒有到期的' : '今天 $n 件還沒做';
    case AppDestination.lifeGoals:
      final goals = dashboard?.lifeGoals;
      if (goals != null && goals.isNotEmpty) return '${goals.length} 個進行中';
    default:
      break;
  }
  return d.description;
}

class _Header extends ConsumerWidget {
  const _Header({this.showSettings = true});

  final bool showSettings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(authControllerProvider).value?.user.name;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(greeting(name), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(todayLabel(), style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
        if (showSettings)
          Flexible(
            flex: 2,
            child: Wrap(
              alignment: WrapAlignment.end,
              children: [for (final a in settingsActions(context, ref)) LabeledIconButton(action: a)],
            ),
          ),
      ],
    );
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({required this.destination, required this.subtitle, required this.onTap});

  final AppDestination destination;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 180,
      height: 128,
      child: Card(
        margin: EdgeInsets.zero,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppAccents.personal(scheme.brightness),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: Icon(destination.icon, size: 18, color: scheme.onSurface),
                ),
                const Spacer(),
                Text(destination.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, height: 1.3, color: scheme.onSurface.withValues(alpha: 0.65)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

const _featureOrder = [
  AppDestination.finance,
  AppDestination.stocks,
  AppDestination.calendar,
  AppDestination.todo,
  AppDestination.lifeGoals,
  AppDestination.journal,
  AppDestination.trips,
  AppDestination.knowledge,
  AppDestination.divination,
  AppDestination.aiAssistant,
];

Widget _page(BuildContext context, List<Widget> children) {
  final brightness = Theme.of(context).colorScheme.brightness;
  return Scaffold(
    body: DecoratedBox(
      decoration: BoxDecoration(gradient: AppGradients.dawn(brightness)),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1200),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
            ),
          ),
        ),
      ),
    ),
  );
}

/// A 功能卡片：所有功能一格一格點，下面是自訂的統計。
class HomeCards extends ConsumerWidget {
  const HomeCards({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(homeDashboardProvider).value;
    return _page(context, [
      const _Header(),
      const SizedBox(height: 20),
      Wrap(
        spacing: 14,
        runSpacing: 14,
        children: [
          for (final d in _featureOrder)
            _FeatureCard(
              destination: d,
              subtitle: destinationSubtitle(d, dashboard),
              onTap: () => ref.read(navProvider.notifier).go(d),
            ),
        ],
      ),
      const SizedBox(height: 32),
      const HomeDashboardSection(),
    ]);
  }
}

/// B 左邊選單：選單在外面（MainShell），這裡只放今天的總覽。
class HomeSidebar extends ConsumerWidget {
  const HomeSidebar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _page(context, [
      const _Header(showSettings: false),
      const SizedBox(height: 24),
      const HomeDashboardSection(title: '今天'),
    ]);
  }
}

/// C AI 優先：最上面就是跟 AI 說話的輸入框和常用一句話。
class HomeAi extends ConsumerStatefulWidget {
  const HomeAi({super.key});

  @override
  ConsumerState<HomeAi> createState() => _HomeAiState();
}

class _HomeAiState extends ConsumerState<HomeAi> {
  final _controller = TextEditingController();

  static const _quick = ['我每個帳戶還剩多少', '今天要做什麼', '這個月花了多少', '幫我做這週的回顧'];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _ask(String text) {
    final question = text.trim();
    if (question.isEmpty) return;
    ref.read(pendingAiQuestionProvider.notifier).set(question);
    ref.read(navProvider.notifier).go(AppDestination.aiAssistant);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final name = ref.watch(authControllerProvider).value?.user.name;
    return _page(context, [
      Align(
        alignment: Alignment.centerRight,
        child: Wrap(children: [for (final a in settingsActions(context, ref)) LabeledIconButton(action: a)]),
      ),
      const SizedBox(height: 12),
      Text(
        '${greeting(name)}，今天想做什麼？',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 16),
      Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Column(
            children: [
              TextField(
                controller: _controller,
                onSubmitted: _ask,
                decoration: InputDecoration(
                  hintText: '直接打字：晚餐 150、明天 3 點看牙醫、這個月花多少…',
                  filled: true,
                  fillColor: scheme.surface,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(18)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                  suffixIcon: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilledButton(onPressed: () => _ask(_controller.text), child: const Text('送出')),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [for (final q in _quick) ActionChip(label: Text(q), onPressed: () => _ask(q))],
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 24),
      Wrap(
        alignment: WrapAlignment.center,
        spacing: 4,
        runSpacing: 4,
        children: [
          for (final d in _featureOrder)
            InkWell(
              onTap: () => ref.read(navProvider.notifier).go(d),
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 84,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppAccents.personal(scheme.brightness),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(d.icon, size: 20, color: scheme.onSurface),
                      ),
                      const SizedBox(height: 6),
                      Text(d.label, style: const TextStyle(fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
      const SizedBox(height: 24),
      const HomeDashboardSection(),
    ]);
  }
}
