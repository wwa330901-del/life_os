import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/knowledge_brain.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/knowledge_provider.dart';
import '../../../widgets/error_panel.dart';
import 'brain_item_dialog.dart';

/// 打開一個主題點：連到它的收藏，加上改名、合併到別的主題、刪除。
Future<void> showBrainTopic(BuildContext context, String topicId) {
  return showDialog<void>(
    context: context,
    builder: (_) => _BrainTopicDialog(topicId: topicId),
  );
}

class _BrainTopicDialog extends ConsumerWidget {
  const _BrainTopicDialog({required this.topicId});

  final String topicId;

  Future<void> _rename(BuildContext context, WidgetRef ref, BrainTopicDetail topic) async {
    final controller = TextEditingController(text: topic.name);
    final name = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('主題改名'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 20,
          decoration: const InputDecoration(labelText: '新名稱', helperText: '改成已經有的主題名稱，會自動合併'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(c).pop(controller.text.trim()), child: const Text('確定')),
        ],
      ),
    );
    if (name == null || name.isEmpty || name == topic.name || !context.mounted) return;
    await _run(context, ref, () => ref.read(apiClientProvider).renameBrainTopic(topic.id, name), '已改名');
  }

  Future<void> _merge(BuildContext context, WidgetRef ref, BrainTopicDetail topic) async {
    final graph = await ref.read(brainGraphProvider.future);
    if (!context.mounted) return;
    final others = graph.topics.where((t) => t.id != topic.id).toList()..sort((a, b) => b.count.compareTo(a.count));
    final target = await showDialog<BrainTopic>(
      context: context,
      builder: (c) => SimpleDialog(
        title: Text('「${topic.name}」合併到哪個主題？'),
        children: [
          for (final t in others)
            SimpleDialogOption(onPressed: () => Navigator.of(c).pop(t), child: Text('${t.name}（${t.count} 則）')),
        ],
      ),
    );
    if (target == null || !context.mounted) return;
    await _run(
      context,
      ref,
      () => ref.read(apiClientProvider).mergeBrainTopic(topic.id, target.id),
      '已合併到「${target.name}」',
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, BrainTopicDetail topic) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('刪除主題「${topic.name}」？'),
        content: const Text('只會拿掉這個主題點，裡面的收藏都還在。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    await _run(context, ref, () => ref.read(apiClientProvider).deleteBrainTopic(topic.id), '已刪除主題');
  }

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action, String done) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      refreshBrain(ref);
      if (context.mounted) Navigator.of(context).pop();
      messenger.showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      messenger.showSnackBar(errorSnackBar(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(brainTopicProvider(topicId));
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560, maxHeight: 720),
        child: async.when(
          loading: () => const SizedBox(height: 200, child: Center(child: CircularProgressIndicator())),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: ErrorPanel(error: e, onRetry: () => ref.invalidate(brainTopicProvider(topicId))),
          ),
          data: (topic) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 8, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${topic.name}（${topic.items.length} 則）',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    PopupMenuButton<String>(
                      tooltip: '主題設定',
                      onSelected: (a) => switch (a) {
                        'rename' => _rename(context, ref, topic),
                        'merge' => _merge(context, ref, topic),
                        _ => _delete(context, ref, topic),
                      },
                      itemBuilder: (_) => const [
                        PopupMenuItem(value: 'rename', child: Text('改名')),
                        PopupMenuItem(value: 'merge', child: Text('合併到別的主題')),
                        PopupMenuItem(value: 'delete', child: Text('刪除這個主題')),
                      ],
                    ),
                    IconButton(
                      tooltip: '關閉',
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                  itemCount: topic.items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final it = topic.items[i];
                    return ListTile(
                      leading: Icon(it.read ? Icons.circle_outlined : Icons.circle, size: 12),
                      title: Text(it.title),
                      subtitle: it.summary != null
                          ? Text(it.summary!, maxLines: 2, overflow: TextOverflow.ellipsis)
                          : null,
                      onTap: () {
                        Navigator.of(context).pop();
                        showBrainItem(context, it.id);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
