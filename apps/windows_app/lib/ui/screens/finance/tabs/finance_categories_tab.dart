import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';

/// 母分類/子分類 management — exactly two levels. A 母分類 with children
/// can no longer be picked directly on a transaction (see
/// `FinanceCategoryTree.leaves` / the transaction-entry category picker),
/// so this screen makes that relationship visible: children are nested
/// directly under their parent instead of a flat list.
class FinanceCategoriesTab extends ConsumerWidget {
  const FinanceCategoriesTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoriesAsync = ref.watch(financeCategoriesProvider(spaceId));

    return categoriesAsync.when(
      data: (categories) {
        final income = categories.topLevel.where((c) => c.kind == FinanceCategoryKind.income).toList();
        final expense = categories.topLevel.where((c) => c.kind == FinanceCategoryKind.expense).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            Row(
              children: [
                Expanded(child: Text('支出分類', style: Theme.of(context).textTheme.titleMedium)),
                TextButton.icon(
                  onPressed: () => _openEditor(
                    context,
                    ref,
                    spaceId,
                    existing: null,
                    kind: FinanceCategoryKind.expense,
                    categories: categories,
                  ),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('新增母分類'),
                ),
              ],
            ),
            for (final parent in expense)
              _CategoryGroup(parent: parent, categories: categories, ref: ref, spaceId: spaceId),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(child: Text('收入分類', style: Theme.of(context).textTheme.titleMedium)),
                TextButton.icon(
                  onPressed: () => _openEditor(
                    context,
                    ref,
                    spaceId,
                    existing: null,
                    kind: FinanceCategoryKind.income,
                    categories: categories,
                  ),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('新增母分類'),
                ),
              ],
            ),
            for (final parent in income)
              _CategoryGroup(parent: parent, categories: categories, ref: ref, spaceId: spaceId),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取分類失敗：$error')),
    );
  }

  /// [parentId] set → creating/editing a 子分類 under that parent (kind is
  /// forced to match it). Editing an existing category that already has
  /// children of its own can't be re-parented (母分類欄位隱藏) — matches
  /// the backend's two-level enforcement.
  static Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref,
    String spaceId, {
    required FinanceCategory? existing,
    required FinanceCategoryKind kind,
    required List<FinanceCategory> categories,
    String? parentId,
  }) async {
    final nameController = TextEditingController(text: existing?.name ?? '');
    final canReparent = existing == null || !categories.hasChildren(existing.id);
    var selectedParentId = existing?.parentId ?? parentId;
    final parentOptions = categories.topLevel
        .where((c) => c.kind == kind && c.id != existing?.id)
        .toList();

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增分類' : '編輯分類'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                decoration: const InputDecoration(labelText: '分類名稱'),
              ),
              if (canReparent && parentOptions.isNotEmpty) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String?>(
                  initialValue: selectedParentId,
                  decoration: const InputDecoration(labelText: '母分類（選填，不選就是母分類本身）'),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('無（這是一個母分類）')),
                    for (final p in parentOptions) DropdownMenuItem(value: p.id, child: Text(p.name)),
                  ],
                  onChanged: (value) => setState(() => selectedParentId = value),
                ),
              ],
              if (!canReparent)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '這個分類底下已經有子分類，不能再變成別人的子分類。',
                    style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.error),
                  ),
                ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;

    final name = nameController.text.trim();
    if (name.isEmpty) return;

    try {
      if (existing == null) {
        await ref
            .read(apiClientProvider)
            .createFinanceCategory(spaceId: spaceId, name: name, kind: kind, parentId: selectedParentId);
      } else {
        await ref.read(apiClientProvider).updateFinanceCategory(
          spaceId: spaceId,
          categoryId: existing.id,
          name: name,
          parentId: selectedParentId,
          clearParentId: selectedParentId == null,
        );
      }
      ref.invalidate(financeCategoriesProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

/// 子分類預設收起——分類一多畫面會拉得很長，展開只在使用者想看細節時才
/// 需要（2026-08-05 使用者回報）。展開狀態只存在這個 widget 自己的 State
/// 裡，不記憶跨畫面/跨重啟，每次進來都是全部收起的乾淨畫面。
class _CategoryGroup extends StatefulWidget {
  const _CategoryGroup({
    required this.parent,
    required this.categories,
    required this.ref,
    required this.spaceId,
  });

  final FinanceCategory parent;
  final List<FinanceCategory> categories;
  final WidgetRef ref;
  final String spaceId;

  @override
  State<_CategoryGroup> createState() => _CategoryGroupState();
}

class _CategoryGroupState extends State<_CategoryGroup> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final parent = widget.parent;
    final categories = widget.categories;
    final ref = widget.ref;
    final spaceId = widget.spaceId;
    final children = categories.childrenOf(parent.id);

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CategoryTile(
            category: parent,
            ref: ref,
            spaceId: spaceId,
            categories: categories,
            isParent: true,
            childCount: children.length,
            expanded: children.isEmpty ? null : _expanded,
            onToggleExpanded: children.isEmpty ? null : () => setState(() => _expanded = !_expanded),
          ),
          if (children.isEmpty || _expanded) ...[
            for (final child in children)
              Padding(
                padding: const EdgeInsets.only(left: 24),
                child: _CategoryTile(category: child, ref: ref, spaceId: spaceId, categories: categories),
              ),
            Padding(
              padding: const EdgeInsets.only(left: 24, bottom: 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => FinanceCategoriesTab._openEditor(
                    context,
                    ref,
                    spaceId,
                    existing: null,
                    kind: parent.kind,
                    categories: categories,
                    parentId: parent.id,
                  ),
                  icon: const Icon(Icons.add, size: 14),
                  label: const Text('新增子分類', style: TextStyle(fontSize: 12)),
                  style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.category,
    required this.ref,
    required this.spaceId,
    required this.categories,
    this.isParent = false,
    this.childCount = 0,
    this.expanded,
    this.onToggleExpanded,
  });

  final FinanceCategory category;
  final WidgetRef ref;
  final String spaceId;
  final List<FinanceCategory> categories;
  final bool isParent;

  /// The three below are parent-only, and only meaningful when the parent
  /// actually has children to hide/show (`onToggleExpanded` is null
  /// otherwise, and no chevron is rendered).
  final int childCount;
  final bool? expanded;
  final VoidCallback? onToggleExpanded;

  Future<void> _delete(BuildContext context) async {
    final hasChildren = categories.hasChildren(category.id);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除分類'),
        content: Text(
          hasChildren
              ? '「${category.name}」底下還有子分類，一併刪除後，過去用到這些分類的交易紀錄會變成「未分類」，不會被刪除。確定要刪除嗎？'
              : '確定要刪除「${category.name}」嗎？這個分類過去的交易紀錄會變成「未分類」，不會被刪除。',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .deleteFinanceCategory(spaceId: spaceId, categoryId: category.id);
      ref.invalidate(financeCategoriesProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      color: isParent ? scheme.surfaceContainerHighest.withValues(alpha: 0.4) : null,
      child: ListTile(
        dense: !isParent,
        onTap: onToggleExpanded,
        title: Text(
          category.name,
          style: TextStyle(fontWeight: isParent ? FontWeight.w700 : FontWeight.normal),
        ),
        subtitle: expanded == null ? null : Text('$childCount 個子分類', style: const TextStyle(fontSize: 12)),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (expanded != null)
              Icon(expanded! ? Icons.expand_less : Icons.expand_more, color: scheme.onSurface.withValues(alpha: 0.6)),
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 18),
              onPressed: () => FinanceCategoriesTab._openEditor(
                context,
                ref,
                spaceId,
                existing: category,
                kind: category.kind,
                categories: categories,
              ),
            ),
            IconButton(icon: const Icon(Icons.delete_outline, size: 18), onPressed: () => _delete(context)),
          ],
        ),
      ),
    );
  }
}
