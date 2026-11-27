import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/knowledge.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/knowledge_provider.dart';
import '../../../widgets/error_panel.dart';
import 'brain_topic_dialog.dart';

/// 打開大腦裡的一則（2026-11-27）：一打開就是 AI 分析和重點；右上「看原文」
/// 看你傳的截圖／錄影／全文（只有連結的才跳瀏覽器）；右邊是 AI 覺得相關的、
/// 連到這裡的主題。打開就算「看過了」。
Future<void> showBrainItem(BuildContext context, String itemId) {
  return showDialog<void>(
    context: context,
    builder: (_) => BrainItemDialog(itemId: itemId),
  );
}

class BrainItemDialog extends ConsumerStatefulWidget {
  const BrainItemDialog({super.key, required this.itemId});

  final String itemId;

  @override
  ConsumerState<BrainItemDialog> createState() => _BrainItemDialogState();
}

class _BrainItemDialogState extends ConsumerState<BrainItemDialog> {
  bool _markedRead = false;

  void _markReadOnce(KnowledgeItem item) {
    if (_markedRead || item.readAt != null || item.status != KnowledgeItemStatus.done) return;
    _markedRead = true;
    ref
        .read(apiClientProvider)
        .setKnowledgeRead(item.id, true)
        .then((_) {
          ref.invalidate(brainOverviewProvider);
          ref.invalidate(brainGraphProvider);
        })
        .catchError((_) {});
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _showOriginal(KnowledgeItem item) async {
    final hasFile = item.fileUrl != null;
    final hasText = item.rawContent != null && item.rawContent!.trim().isNotEmpty;
    // 只有連結（沒存到截圖、錄影或全文）才直接跳瀏覽器。
    if (!hasFile && !hasText && item.sourceUrl != null) {
      await _openUrl(item.sourceUrl!);
      return;
    }
    if (!hasFile && !hasText) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('這則沒有存到原文。')));
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (_) => _OriginalDialog(item: item, onOpenUrl: _openUrl),
    );
  }

  Future<void> _menu(String action, KnowledgeItem item) async {
    final api = ref.read(apiClientProvider);
    final messenger = ScaffoldMessenger.of(context);
    try {
      switch (action) {
        case 'unread':
          await api.setKnowledgeRead(item.id, false);
          _markedRead = true;
          refreshBrain(ref);
          ref.invalidate(knowledgeItemDetailProvider(item.id));
          messenger.showSnackBar(const SnackBar(content: Text('已標成還沒看')));
        case 'reanalyze':
          messenger.showSnackBar(const SnackBar(content: Text('重新分析中，好了 LINE 會通知你…')));
          await api.reanalyzeKnowledgeItem(item.id);
          ref.invalidate(knowledgeItemDetailProvider(item.id));
          ref.invalidate(brainConnectionsProvider(item.id));
          refreshBrain(ref);
          messenger.showSnackBar(const SnackBar(content: Text('重新分析完成')));
        case 'share':
          await api.shareKnowledgeItem(item.id);
          messenger.showSnackBar(const SnackBar(content: Text('已傳到你的 LINE，可以轉發給朋友。')));
        case 'delete':
          final ok = await showDialog<bool>(
            context: context,
            builder: (c) => AlertDialog(
              title: const Text('刪除這則？'),
              content: Text('「${item.title ?? '未命名'}」會從大腦裡刪掉，連線也會一起拿掉。'),
              actions: [
                TextButton(onPressed: () => Navigator.of(c).pop(false), child: const Text('取消')),
                FilledButton(onPressed: () => Navigator.of(c).pop(true), child: const Text('刪除')),
              ],
            ),
          );
          if (ok != true) return;
          await api.deleteKnowledgeItem(item.id);
          refreshBrain(ref);
          if (mounted) Navigator.of(context).pop();
          messenger.showSnackBar(const SnackBar(content: Text('已刪除')));
      }
    } on ApiException catch (e) {
      messenger.showSnackBar(errorSnackBar(e));
    } catch (_) {
      ref.invalidate(knowledgeItemDetailProvider(item.id));
      messenger.showSnackBar(const SnackBar(content: Text('沒有收到回應，等一下重新打開看看有沒有完成。')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(knowledgeItemDetailProvider(widget.itemId));
    final wide = MediaQuery.sizeOf(context).width >= 900;
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: wide ? 1000 : 560, maxHeight: 760),
        child: detail.when(
          loading: () => const SizedBox(height: 240, child: Center(child: CircularProgressIndicator())),
          error: (e, _) => Padding(
            padding: const EdgeInsets.all(24),
            child: ErrorPanel(error: e, onRetry: () => ref.invalidate(knowledgeItemDetailProvider(widget.itemId))),
          ),
          data: (item) {
            WidgetsBinding.instance.addPostFrameCallback((_) => _markReadOnce(item));
            final main = _MainColumn(item: item, onOriginal: () => _showOriginal(item), onMenu: (a) => _menu(a, item));
            final side = _SideColumn(itemId: item.id);
            if (wide) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: main),
                  const VerticalDivider(width: 1),
                  SizedBox(width: 320, child: side),
                ],
              );
            }
            return SingleChildScrollView(child: Column(children: [main, const Divider(height: 1), side]));
          },
        ),
      ),
    );
  }
}

class _MainColumn extends StatelessWidget {
  const _MainColumn({required this.item, required this.onOriginal, required this.onMenu});

  final KnowledgeItem item;
  final VoidCallback onOriginal;
  final void Function(String action) onMenu;

  String _md(DateTime d) => '${d.month}/${d.day}';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final c = item.createdAt.toLocal();
    final event = _eventLine(item);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title ?? item.status.label,
                      style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '${c.month}/${c.day} 存的${item.sourcePlatform != null && item.sourcePlatform!.isNotEmpty ? ' · 來源：${item.sourcePlatform}' : ''}',
                      style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                onPressed: onOriginal,
                icon: const Icon(Icons.article_outlined),
                label: const Text('看原文'),
              ),
              PopupMenuButton<String>(
                tooltip: '更多動作',
                onSelected: onMenu,
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'unread', child: Text('標成還沒看')),
                  PopupMenuItem(value: 'reanalyze', child: Text('重新分析')),
                  PopupMenuItem(value: 'share', child: Text('傳到我的 LINE')),
                  PopupMenuItem(value: 'delete', child: Text('刪除')),
                ],
              ),
              IconButton(tooltip: '關閉', icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
            ],
          ),
          if (event != null) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(color: scheme.tertiaryContainer, borderRadius: BorderRadius.circular(12)),
              child: Text(
                event,
                style: TextStyle(color: scheme.onTertiaryContainer, fontWeight: FontWeight.w600),
              ),
            ),
          ],
          if (item.status != KnowledgeItemStatus.done) ...[
            const SizedBox(height: 16),
            Text(item.status == KnowledgeItemStatus.failed ? '分析失敗：${item.errorMessage ?? ''}' : '還在分析中…'),
          ],
          if (item.summary != null && item.summary!.isNotEmpty) ...[
            const SizedBox(height: 20),
            Text('AI 分析', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            SelectableText(item.summary!, style: theme.textTheme.bodyLarge?.copyWith(height: 1.7)),
          ],
          if (item.fieldValues.any((f) => f.displayValue.isNotEmpty)) ...[
            const SizedBox(height: 20),
            Wrap(
              spacing: 28,
              runSpacing: 10,
              children: [
                for (final f in item.fieldValues)
                  if (f.displayValue.isNotEmpty)
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 360),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: '${f.fieldName}：',
                              style: TextStyle(color: scheme.onSurfaceVariant),
                            ),
                            TextSpan(text: f.displayValue),
                          ],
                        ),
                      ),
                    ),
              ],
            ),
          ],
          if (item.tags.isNotEmpty) ...[
            const SizedBox(height: 20),
            Wrap(spacing: 6, runSpacing: 6, children: [for (final t in item.tags) Chip(label: Text('#$t'))]),
          ],
          if (item.eventStartDate != null && item.eventEndDate != null) ...[
            const SizedBox(height: 12),
            Text('期間：${_md(item.eventStartDate!)} – ${_md(item.eventEndDate!)}', style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }

  String? _eventLine(KnowledgeItem item) {
    final end = item.eventEndDate;
    final start = item.eventStartDate;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    if (start != null && DateTime(start.year, start.month, start.day).isAfter(today)) {
      return '${start.month}/${start.day} 開始${end != null ? '，${end.month}/${end.day} 結束' : ''}，開展那天會提醒你';
    }
    if (end == null) return null;
    final left = DateTime(end.year, end.month, end.day).difference(today).inDays;
    if (left < 0) return '已經在 ${end.month}/${end.day} 結束了';
    if (left == 0) return '今天是最後一天！';
    return '還剩 $left 天 · ${end.month}/${end.day} 結束，快到了會用 LINE 提醒你';
  }
}

class _SideColumn extends ConsumerWidget {
  const _SideColumn({required this.itemId});

  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final conn = ref.watch(brainConnectionsProvider(itemId));
    return conn.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(16),
        child: ErrorPanel(error: e, onRetry: () => ref.invalidate(brainConnectionsProvider(itemId))),
      ),
      data: (c) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.all(20),
        children: [
          Text('AI 覺得相關的', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (c.related.isEmpty)
            Text('還沒有相關的收藏', style: theme.textTheme.bodySmall)
          else
            for (final r in c.related)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(r.title),
                subtitle: r.reason != null ? Text(r.reason!) : null,
                onTap: () {
                  Navigator.of(context).pop();
                  showBrainItem(context, r.id);
                },
              ),
          const SizedBox(height: 16),
          Text('連到這裡的主題', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final t in c.topics)
                ActionChip(
                  label: Text('${t.name}（${t.count} 則）'),
                  onPressed: () {
                    Navigator.of(context).pop();
                    showBrainTopic(context, t.id);
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 看原文：截圖直接看（可放大）、錄影用播放器開、文章全文直接讀，下面有「打開連結」。
class _OriginalDialog extends StatelessWidget {
  const _OriginalDialog({required this.item, required this.onOpenUrl});

  final KnowledgeItem item;
  final void Function(String url) onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isVideo = item.sourcePlatform == '影片';
    return Dialog(
      insetPadding: const EdgeInsets.all(24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900, maxHeight: 820),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 8, 8),
              child: Row(
                children: [
                  Expanded(child: Text('原文：${item.title ?? ''}', style: theme.textTheme.titleLarge)),
                  IconButton(
                    tooltip: '關閉',
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (item.fileUrl != null && !isVideo)
                      InteractiveViewer(
                        maxScale: 5,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.network(
                            item.fileUrl!,
                            fit: BoxFit.contain,
                            errorBuilder: (_, _, _) => const Text('圖片載入失敗，關掉再打開試試看。'),
                          ),
                        ),
                      ),
                    if (item.fileUrl != null && isVideo)
                      Container(
                        height: 260,
                        decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(10)),
                        child: Center(
                          child: FilledButton.icon(
                            onPressed: () => onOpenUrl(item.fileUrl!),
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('播放錄影'),
                          ),
                        ),
                      ),
                    if (item.rawContent != null && item.rawContent!.trim().isNotEmpty) ...[
                      if (item.fileUrl != null) const SizedBox(height: 16),
                      SelectableText(item.rawContent!, style: theme.textTheme.bodyMedium?.copyWith(height: 1.7)),
                    ],
                  ],
                ),
              ),
            ),
            if (item.sourceUrl != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: OutlinedButton.icon(
                    onPressed: () => onOpenUrl(item.sourceUrl!),
                    icon: const Icon(Icons.open_in_new),
                    label: const Text('打開連結'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
