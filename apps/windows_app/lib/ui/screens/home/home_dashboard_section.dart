import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/home_dashboard.dart';
import '../../../state/auth_provider.dart';
import '../../../state/home_provider.dart';
import '../../widgets/error_panel.dart';
import 'home_dashboard_widgets.dart';

/// 首頁的統計／總覽小工具（使用者在「自訂版面」勾選要看哪些、排順序）。三種版面共用。
class HomeDashboardSection extends ConsumerWidget {
  const HomeDashboardSection({super.key, this.title = '首頁總覽'});

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layoutAsync = ref.watch(homeLayoutProvider);
    final dashboardAsync = ref.watch(homeDashboardProvider);
    void retry() {
      ref.invalidate(homeLayoutProvider);
      ref.invalidate(homeDashboardProvider);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
            TextButton.icon(
              onPressed: () => openHomeLayoutEditor(context, ref),
              icon: const Icon(Icons.tune, size: 16),
              label: const Text('自訂版面'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        layoutAsync.when(
          data: (layout) => dashboardAsync.when(
            data: (dashboard) {
              final widgets = layout
                  .where((w) => w.visible)
                  .map((w) => buildHomeWidget(context, w.type, dashboard))
                  .whereType<Widget>()
                  .toList();
              if (widgets.isEmpty) return const Text('版面上目前沒有任何小工具，按右上角「自訂版面」開啟。');
              return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: widgets);
            },
            loading: () => const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, _) => ErrorPanel(error: error, onRetry: retry),
          ),
          loading: () => const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (error, _) => ErrorPanel(error: error, onRetry: retry),
        ),
      ],
    );
  }
}

Future<void> openHomeLayoutEditor(BuildContext context, WidgetRef ref) async {
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
          height: 420,
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
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e));
  }
}
