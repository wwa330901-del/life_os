import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../state/knowledge_provider.dart';
import '../knowledge_category_settings_screen.dart';
import '../knowledge_item_card.dart';

/// 私人區 — everything the caller owns, regardless of that category's own
/// public/private flag (an owner always sees 100% of their own stuff).
class PrivateKnowledgeTab extends ConsumerStatefulWidget {
  const PrivateKnowledgeTab({super.key});

  @override
  ConsumerState<PrivateKnowledgeTab> createState() => _PrivateKnowledgeTabState();
}

class _PrivateKnowledgeTabState extends ConsumerState<PrivateKnowledgeTab> {
  String? _categoryId;
  String _search = '';
  bool _showSettings = false;

  @override
  Widget build(BuildContext context) {
    if (_showSettings) {
      return KnowledgeCategorySettingsScreen(onBack: () => setState(() => _showSettings = false));
    }

    final categoriesAsync = ref.watch(knowledgeCategoriesProvider);
    final itemsAsync = ref.watch(
      knowledgeItemsProvider((categoryId: _categoryId, search: _search.isEmpty ? null : _search)),
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
                        DropdownMenuItem(value: category.id, child: Text(category.name)),
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
              const SizedBox(width: 12),
              IconButton(
                icon: const Icon(Icons.settings_outlined),
                tooltip: '管理分類',
                onPressed: () => setState(() => _showSettings = true),
              ),
            ],
          ),
        ),
        Expanded(
          child: itemsAsync.when(
            data: (items) {
              if (items.isEmpty) {
                return const Center(child: Text('目前沒有資料，傳連結給 LINE 開始收集吧'));
              }
              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) => KnowledgeItemCard(item: items[index], isOwn: true),
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
