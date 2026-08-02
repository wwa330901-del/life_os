import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../state/knowledge_provider.dart';
import '../knowledge_item_card.dart';

/// 公開區 — other users' items whose category owner marked it public and
/// hasn't blacklisted the caller. Browsing here never touches the caller's
/// own categories/fields — see KnowledgeItemDetailDialog's "存一份到我的
/// 知識庫" for the only way something here ends up in the caller's own
/// private library.
class PublicKnowledgeTab extends ConsumerStatefulWidget {
  const PublicKnowledgeTab({super.key});

  @override
  ConsumerState<PublicKnowledgeTab> createState() => _PublicKnowledgeTabState();
}

class _PublicKnowledgeTabState extends ConsumerState<PublicKnowledgeTab> {
  String? _categoryId;
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(publicKnowledgeCategoriesProvider);
    final itemsAsync = ref.watch(
      publicKnowledgeItemsProvider((categoryId: _categoryId, search: _search.isEmpty ? null : _search)),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: categoriesAsync.when(
                  data: (categories) => DropdownButtonFormField<String?>(
                    initialValue: _categoryId,
                    decoration: const InputDecoration(labelText: '分類', isDense: true),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('全部分類')),
                      for (final category in categories)
                        DropdownMenuItem(
                          value: category.id,
                          child: Text('${category.name}（${category.ownerName ?? ''}）'),
                        ),
                    ],
                    onChanged: (value) => setState(() => _categoryId = value),
                  ),
                  loading: () => const LinearProgressIndicator(),
                  error: (error, _) => Text('讀取分類失敗：$error'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(labelText: '搜尋', isDense: true, prefixIcon: Icon(Icons.search)),
                  onChanged: (value) => setState(() => _search = value),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: itemsAsync.when(
            data: (items) {
              if (items.isEmpty) {
                return const Center(child: Text('目前沒有其他人公開分享的知識'));
              }
              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) => KnowledgeItemCard(item: items[index], isOwn: false),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('讀取失敗：$error')),
          ),
        ),
      ],
    );
  }
}
