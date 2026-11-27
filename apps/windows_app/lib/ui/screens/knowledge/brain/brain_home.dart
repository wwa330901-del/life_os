import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/knowledge_brain.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/knowledge_provider.dart';
import '../../../widgets/error_panel.dart';
import '../tabs/private_knowledge_tab.dart';
import 'brain_graph_view.dart';
import 'brain_item_dialog.dart';
import 'brain_topic_dialog.dart';

/// 我的大腦（2026-11-27）：左邊「現在要知道的」（快結束的展覽、還沒看的、
/// 最常用的主題），右邊大腦地圖；可以切成列表（原本的搜尋列表）。
/// 窄螢幕（手機、直立平板）改成上面三顆切換。
class BrainHome extends ConsumerStatefulWidget {
  const BrainHome({super.key, this.actions = const []});

  /// 右上角的按鈕（別人分享的、AI 用量）。
  final List<Widget> actions;

  @override
  ConsumerState<BrainHome> createState() => _BrainHomeState();
}

enum _View { map, list }

class _BrainHomeState extends ConsumerState<BrainHome> {
  _View _view = _View.map;
  int _narrowTab = 0;

  Future<void> _organize() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final n = await ref.read(apiClientProvider).organizeBrain();
      messenger.showSnackBar(SnackBar(content: Text(n == 0 ? '舊收藏都整理過了，或正在整理中。' : 'AI 開始整理 $n 則舊收藏，好了會用 LINE 通知你。')));
    } on ApiException catch (e) {
      messenger.showSnackBar(errorSnackBar(e));
    }
  }

  Widget _content() {
    if (_view == _View.list) return const PrivateKnowledgeTab();
    final graph = ref.watch(brainGraphProvider);
    return graph.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorPanel(error: e, onRetry: () => ref.invalidate(brainGraphProvider)),
      data: (g) => g.items.isEmpty
          ? const Center(child: Text('大腦還是空的。傳連結、截圖或螢幕錄影給 LINE，就會自動存進來。'))
          : BrainGraphView(
              graph: g,
              onOpenItem: (id) => showBrainItem(context, id),
              onOpenTopic: (id) => showBrainTopic(context, id),
            ),
    );
  }

  Widget _viewSwitch() => SegmentedButton<_View>(
    segments: const [
      ButtonSegment(value: _View.map, label: Text('地圖'), icon: Icon(Icons.hub_outlined)),
      ButtonSegment(value: _View.list, label: Text('列表'), icon: Icon(Icons.list)),
    ],
    selected: {_view},
    onSelectionChanged: (s) => setState(() => _view = s.first),
  );

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 820) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 0, label: Text('現在')),
                    ButtonSegment(value: 1, label: Text('地圖')),
                    ButtonSegment(value: 2, label: Text('列表')),
                  ],
                  selected: {_narrowTab},
                  onSelectionChanged: (s) => setState(() {
                    _narrowTab = s.first;
                    if (_narrowTab > 0) _view = _narrowTab == 1 ? _View.map : _View.list;
                  }),
                ),
              ),
              if (widget.actions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Wrap(alignment: WrapAlignment.end, children: widget.actions),
                ),
              Expanded(child: _narrowTab == 0 ? _NowPanel(onOrganize: _organize) : _content()),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(width: 340, child: _NowPanel(onOrganize: _organize)),
            const VerticalDivider(width: 1),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 16, 4),
                    child: Row(
                      children: [
                        Text(
                          '大腦地圖',
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _view == _View.map ? '大圓點＝主題，小圓點＝收藏（實心＝還沒看）。可以拖、可以縮放，點一下打開。' : '',
                            style: Theme.of(context).textTheme.bodySmall,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        _viewSwitch(),
                        ...widget.actions,
                      ],
                    ),
                  ),
                  Expanded(child: _content()),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// 左邊「現在要知道的」。
class _NowPanel extends ConsumerWidget {
  const _NowPanel({required this.onOrganize});

  final VoidCallback onOrganize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final overview = ref.watch(brainOverviewProvider);
    return overview.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: ErrorPanel(error: e, onRetry: () => ref.invalidate(brainOverviewProvider)),
      ),
      data: (o) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('我的大腦', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          Text('共 ${o.total} 則 · ${o.topicCount} 個主題', style: theme.textTheme.bodySmall),
          const SizedBox(height: 20),
          if (o.events.isNotEmpty) ...[
            _heading(context, '快到的展覽、活動', color: scheme.tertiary),
            for (final e in o.events) _EventTile(event: e),
            const SizedBox(height: 16),
          ],
          _heading(context, '還沒看的（${o.unreadCount}）'),
          if (o.unread.isEmpty)
            Text('都看過了 👍', style: theme.textTheme.bodySmall)
          else
            for (final u in o.unread)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.circle, size: 10, color: scheme.primary),
                minLeadingWidth: 12,
                title: Text(u.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: u.sourcePlatform != null && u.sourcePlatform!.isNotEmpty ? Text(u.sourcePlatform!) : null,
                onTap: () => showBrainItem(context, u.id),
              ),
          const SizedBox(height: 16),
          if (o.topTopics.isNotEmpty) ...[
            _heading(context, '最常用的主題'),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final t in o.topTopics)
                  ActionChip(label: Text('${t.name} ${t.count}'), onPressed: () => showBrainTopic(context, t.id)),
              ],
            ),
            const SizedBox(height: 24),
          ],
          OutlinedButton.icon(
            onPressed: onOrganize,
            icon: const Icon(Icons.auto_awesome_outlined),
            label: const Text('整理舊收藏（AI 幫舊的接上主題和連線）'),
          ),
          const SizedBox(height: 8),
          Text('大腦上線前存的東西還沒連線，按一次就好，AI 會在背景慢慢整理。', style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }

  Widget _heading(BuildContext context, String text, {Color? color}) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      text,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: color),
    ),
  );
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});

  final BrainEvent event;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: event.urgent ? scheme.tertiaryContainer : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => showBrainItem(context, event.id),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(event.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  event.whenText,
                  style: TextStyle(
                    fontSize: 12,
                    color: event.urgent ? scheme.onTertiaryContainer : scheme.onSurfaceVariant,
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
