import 'package:flutter/material.dart';

import '../../../core/models/knowledge.dart';
import 'knowledge_item_detail_dialog.dart';

class KnowledgeItemCard extends StatelessWidget {
  const KnowledgeItemCard({super.key, required this.item, required this.isOwn});

  final KnowledgeItem item;
  final bool isOwn;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
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
        trailing: item.status != KnowledgeItemStatus.done ? Chip(label: Text(item.status.label)) : null,
        onTap: () => showDialog(context: context, builder: (_) => KnowledgeItemDetailDialog(item: item, isOwn: isOwn)),
      ),
    );
  }
}
