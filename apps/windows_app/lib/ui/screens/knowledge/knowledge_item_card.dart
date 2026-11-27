import 'package:flutter/material.dart';

import '../../../core/models/knowledge.dart';
import 'brain/brain_item_dialog.dart';
import 'knowledge_item_detail_dialog.dart';

class KnowledgeItemCard extends StatelessWidget {
  const KnowledgeItemCard({super.key, required this.item, required this.isOwn});

  final KnowledgeItem item;
  final bool isOwn;

  String _formatCreatedAt(DateTime dt) =>
      '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: isOwn && item.status == KnowledgeItemStatus.done
            ? Icon(
                item.readAt == null ? Icons.circle : Icons.circle_outlined,
                size: 12,
                color: Theme.of(context).colorScheme.primary,
              )
            : null,
        minLeadingWidth: 12,
        title: Text(item.title ?? (item.status == KnowledgeItemStatus.done ? '未命名' : item.status.label)),
        subtitle: Text(
          [
            if (item.categoryName != null) item.categoryName!,
            if (!isOwn && item.ownerName != null) item.ownerName!,
            if (item.summary != null && item.summary!.isNotEmpty) item.summary!,
          ].join(' · '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (item.status != KnowledgeItemStatus.done) Chip(label: Text(item.status.label)),
            Text(
              _formatCreatedAt(item.createdAt),
              style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
            ),
          ],
        ),
        onTap: () => isOwn
            ? showBrainItem(context, item.id)
            : showDialog(
                context: context,
                builder: (_) => KnowledgeItemDetailDialog(item: item, isOwn: isOwn),
              ),
      ),
    );
  }
}
