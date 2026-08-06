import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api_client.dart';
import '../../../core/models/knowledge.dart';
import '../../../state/auth_provider.dart';
import '../../../state/knowledge_provider.dart';

/// Full detail view for one knowledge item — works for both the caller's
/// own items and a public one browsed from someone else (in which case
/// [isOwn] is false and 分享/刪除 are replaced by a single "存一份到我的知識庫"
/// action, per the "borrow, don't merge schemas" design).
class KnowledgeItemDetailDialog extends ConsumerWidget {
  const KnowledgeItemDetailDialog({super.key, required this.item, required this.isOwn});

  final KnowledgeItem item;
  final bool isOwn;

  String _formatCreatedAt(DateTime dt) =>
      '${dt.year}/${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';

  Future<void> _openUrl(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _reanalyze(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController();
    final proceed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('重新分析'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('可以輸入額外指示給 AI（例如「分析多一點」），不輸入就直接重新分析一次。'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 3,
              decoration: const InputDecoration(labelText: '額外指示（選填）'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('重新分析')),
        ],
      ),
    );
    if (proceed != true || !context.mounted) return;

    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [CircularProgressIndicator(), SizedBox(width: 16), Text('重新分析中…')],
        ),
      ),
    );
    try {
      await ref
          .read(apiClientProvider)
          .reanalyzeKnowledgeItem(item.id, instruction: controller.text.trim());
      ref.invalidate(knowledgeItemDetailProvider(item.id));
      ref.invalidate(knowledgeItemsProvider);
      if (context.mounted) {
        Navigator.of(context).pop(); // loading dialog
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('重新分析完成')));
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        Navigator.of(context).pop(); // loading dialog
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action, String successMessage) async {
    try {
      await action();
      if (context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  /// 手動指定分類 — AI 判斷不出來（例如 Instagram 連結抓不到內容）時的備援，也
  /// 可以用來把已完成的項目重新歸到別的分類。跟其餘動作一樣，成功後關閉整個
  /// 詳細畫面，讓外層列表下次重新開啟時看到新分類。
  Future<void> _pickCategory(BuildContext context, WidgetRef ref) async {
    final categories = await ref.read(knowledgeCategoriesProvider.future);
    if (!context.mounted) return;
    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('你還沒有任何分類，先到「管理分類」新增一個。')));
      return;
    }

    final chosen = await showDialog<KnowledgeCategory>(
      context: context,
      builder: (dialogContext) => SimpleDialog(
        title: const Text('指定分類'),
        children: [
          for (final category in categories)
            SimpleDialogOption(
              onPressed: () => Navigator.of(dialogContext).pop(category),
              child: Text(category.name),
            ),
        ],
      ),
    );
    if (chosen == null || !context.mounted) return;

    await _run(
      context,
      ref,
      () => ref.read(apiClientProvider).assignKnowledgeItemCategory(item.id, chosen.id),
      '已歸類到「${chosen.name}」。',
    );
    ref.invalidate(knowledgeItemsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 詳細頁抓一份帶 fileUrl/rawContent 的完整版本，載入完成前先用列表傳
    // 進來的 item 頂著顯示（列表本來就有 title/summary/tags 這些），避免
    // 打開對話框先看到一片空白。
    final detailAsync = ref.watch(knowledgeItemDetailProvider(item.id));
    final display = detailAsync.value ?? item;

    return AlertDialog(
      title: Text(display.title ?? '未命名'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                spacing: 6,
                children: [
                  if (display.categoryName != null) Chip(label: Text(display.categoryName!)),
                  if (display.sourcePlatform != null && display.sourcePlatform!.isNotEmpty)
                    Chip(label: Text(display.sourcePlatform!)),
                  if (!isOwn && display.ownerName != null) Chip(label: Text('分享自 ${display.ownerName}')),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '建立時間：${_formatCreatedAt(display.createdAt)}',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
              ),
              if (display.summary != null && display.summary!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(display.summary!),
              ],
              if (display.tags.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(spacing: 6, runSpacing: 6, children: [for (final tag in display.tags) Chip(label: Text('#$tag'))]),
              ],
              if (display.fieldValues.isNotEmpty) ...[
                const SizedBox(height: 12),
                for (final field in display.fieldValues)
                  if (field.displayValue.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('${field.fieldName}：${field.displayValue}'),
                    ),
              ],
              const SizedBox(height: 12),
              Text('來源', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              _SourceContent(item: display, onOpenUrl: (url) => _openUrl(context, url)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
        if (isOwn)
          TextButton(
            onPressed: () => _reanalyze(context, ref),
            child: const Text('重新分析'),
          ),
        if (isOwn)
          TextButton(
            onPressed: () => _pickCategory(context, ref),
            child: const Text('指定分類'),
          ),
        if (isOwn)
          TextButton(
            onPressed: () => _run(
              context,
              ref,
              () => ref.read(apiClientProvider).shareKnowledgeItem(item.id),
              '已傳送到你的 LINE，去轉發給朋友吧。',
            ),
            child: const Text('分享'),
          ),
        if (!isOwn)
          FilledButton(
            onPressed: () => _run(
              context,
              ref,
              () => ref.read(apiClientProvider).saveKnowledgeItemCopy(item.id),
              '已加入分析佇列，會存進你自己的知識庫。',
            ),
            child: const Text('存一份到我的知識庫'),
          ),
        if (isOwn)
          TextButton(
            onPressed: () => _run(
              context,
              ref,
              () => ref.read(apiClientProvider).deleteKnowledgeItem(item.id),
              '已刪除。',
            ),
            child: const Text('刪除'),
          ),
      ],
    );
  }
}

/// 來源顯示 (2026-08-06) — 四選一：圖片直接嵌入、影片給一個開啟連結（桌面
/// 版沒有內建的影片播放器元件，開外部程式看最省事）、連結原樣顯示、純
/// 文字放在一個捲動得動的方塊裡。[item.fileUrl] 只在詳細頁的回應才會有值
/// （見後端 `getDetailWithFileUrl`），列表頁傳進來的版本沒有這個欄位。
class _SourceContent extends StatelessWidget {
  const _SourceContent({required this.item, required this.onOpenUrl});

  final KnowledgeItem item;
  final void Function(String url) onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    if (item.fileUrl != null) {
      if (item.sourcePlatform == '影片') {
        return InkWell(
          onTap: () => onOpenUrl(item.fileUrl!),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.play_circle_outline, color: scheme.primary),
              const SizedBox(width: 6),
              Text(
                '開啟原始影片',
                style: TextStyle(color: scheme.primary, decoration: TextDecoration.underline),
              ),
            ],
          ),
        );
      }
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          item.fileUrl!,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) =>
              Text('圖片載入失敗', style: TextStyle(color: scheme.error)),
        ),
      );
    }

    if (item.sourceUrl != null) {
      return InkWell(
        onTap: () => onOpenUrl(item.sourceUrl!),
        child: Text(
          item.sourceUrl!,
          style: TextStyle(color: scheme.primary, decoration: TextDecoration.underline),
        ),
      );
    }

    if (item.rawContent != null && item.rawContent!.isNotEmpty) {
      return Container(
        padding: const EdgeInsets.all(8),
        constraints: const BoxConstraints(maxHeight: 160),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(8),
        ),
        child: SingleChildScrollView(child: Text(item.rawContent!, style: const TextStyle(fontSize: 12))),
      );
    }

    return Text('沒有原始來源資料', style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.5)));
  }
}
