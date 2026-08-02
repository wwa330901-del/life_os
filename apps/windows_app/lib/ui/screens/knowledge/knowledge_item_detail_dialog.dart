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

  Future<void> _openLink(BuildContext context) async {
    final url = item.sourceUrl;
    if (url == null) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (context.mounted) Navigator.of(context).maybePop();
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
    return AlertDialog(
      title: Text(item.title ?? '未命名'),
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
                  if (item.categoryName != null) Chip(label: Text(item.categoryName!)),
                  if (item.sourcePlatform != null && item.sourcePlatform!.isNotEmpty)
                    Chip(label: Text(item.sourcePlatform!)),
                  if (!isOwn && item.ownerName != null) Chip(label: Text('分享自 ${item.ownerName}')),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                '建立時間：${_formatCreatedAt(item.createdAt)}',
                style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
              ),
              if (item.summary != null && item.summary!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(item.summary!),
              ],
              if (item.tags.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(spacing: 6, runSpacing: 6, children: [for (final tag in item.tags) Chip(label: Text('#$tag'))]),
              ],
              if (item.fieldValues.isNotEmpty) ...[
                const SizedBox(height: 12),
                for (final field in item.fieldValues)
                  if (field.displayValue.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('${field.fieldName}：${field.displayValue}'),
                    ),
              ],
              if (item.sourceUrl != null) ...[
                const SizedBox(height: 12),
                InkWell(
                  onTap: () => _openLink(context),
                  child: Text(
                    item.sourceUrl!,
                    style: TextStyle(color: Theme.of(context).colorScheme.primary, decoration: TextDecoration.underline),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
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
