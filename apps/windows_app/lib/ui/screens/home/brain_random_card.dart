import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/knowledge_brain.dart';
import '../../../state/knowledge_provider.dart';
import '../knowledge/brain/brain_item_dialog.dart';

/// 首頁「從大腦翻出來的」（2026-11-27）：存了不打開就只是存好玩——所以每次
/// 回到首頁都從大腦隨機翻 3 則（至少一則還沒看的），有截圖的顯示縮圖，
/// 點了直接打開那一則；「換一批」再抽一次。
class BrainRandomCard extends ConsumerWidget {
  const BrainRandomCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final async = ref.watch(brainRandomProvider);
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('🧠 從大腦翻出來的', style: theme.textTheme.titleMedium)),
                TextButton.icon(
                  onPressed: () => ref.invalidate(brainRandomProvider),
                  icon: const Icon(Icons.shuffle, size: 16),
                  label: const Text('換一批'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, _) => Row(
                children: [
                  const Expanded(child: Text('暫時翻不出來')),
                  TextButton(onPressed: () => ref.invalidate(brainRandomProvider), child: const Text('再試一次')),
                ],
              ),
              data: (items) => items.isEmpty
                  ? const Text('大腦還是空的。傳連結、截圖或螢幕錄影給 LINE，就會自動存進來。')
                  : LayoutBuilder(
                      builder: (context, c) {
                        final cards = [for (final it in items) _Tile(item: it)];
                        if (c.maxWidth < 600) {
                          return Column(
                            children: [
                              for (final w in cards) Padding(padding: const EdgeInsets.only(bottom: 8), child: w),
                            ],
                          );
                        }
                        return IntrinsicHeight(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (var i = 0; i < cards.length; i++) ...[
                                if (i > 0) const SizedBox(width: 12),
                                Expanded(child: cards[i]),
                              ],
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends ConsumerWidget {
  const _Tile({required this.item});

  final BrainRandomItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final c = item.createdAt.toLocal();
    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () async {
          await showBrainItem(context, item.id);
          ref.invalidate(brainOverviewProvider);
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (item.imageUrl != null)
              SizedBox(
                height: 110,
                child: Image.network(item.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox()),
              ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (!item.read) ...[Icon(Icons.circle, size: 9, color: scheme.primary), const SizedBox(width: 6)],
                      Expanded(
                        child: Text(
                          item.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  if (item.summary != null && item.summary!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(item.summary!, maxLines: 3, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodySmall),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    [
                      '${c.month}/${c.day} 存的',
                      if (!item.read) '還沒看',
                      if (item.topics.isNotEmpty) item.topics.take(2).join('、'),
                    ].join(' · '),
                    style: theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
