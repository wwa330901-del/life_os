import 'work_item.dart';

/// Groups [items] by their [WorkItem.parentId]. The `null` key holds every
/// top-level item. Each group is sorted by [WorkItem.sortOrder].
Map<String?, List<WorkItem>> groupByParent(List<WorkItem> items) {
  final map = <String?, List<WorkItem>>{};
  for (final item in items) {
    map.putIfAbsent(item.parentId, () => []).add(item);
  }
  for (final list in map.values) {
    list.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }
  return map;
}

/// IDs of items that have at least one child — i.e. summary/母項目 rows
/// whose schedule is an aggregate of their descendants rather than their
/// own duration/predecessors. Whether an item is a parent is always
/// derived this way, never stored, so a leaf automatically becomes a
/// summary row the moment something is nested under it.
Set<String> parentItemIds(List<WorkItem> items) {
  return {
    for (final item in items)
      if (item.parentId != null) item.parentId!,
  };
}

/// One row of a flattened, depth-first tree traversal — what a tree-style
/// task table or a row-aligned Gantt canvas actually iterates over.
class FlatTreeItem {
  final WorkItem item;
  final int depth;
  final bool hasChildren;

  const FlatTreeItem({
    required this.item,
    required this.depth,
    required this.hasChildren,
  });
}

/// Depth-first flattening of the parent/child tree: every top-level item
/// followed immediately by its descendants (recursively, unlimited depth),
/// each sorted by [WorkItem.sortOrder] within its sibling group. A node in
/// [collapsedIds] contributes its own row but its descendants are skipped,
/// so both the task table and the Gantt canvas can stay in row-for-row sync
/// by flattening with the same collapse state.
List<FlatTreeItem> flattenTree(
  List<WorkItem> items, {
  Set<String> collapsedIds = const {},
}) {
  final grouped = groupByParent(items);
  final parentIds = parentItemIds(items);
  final result = <FlatTreeItem>[];

  void visit(String? parentId, int depth) {
    for (final child in grouped[parentId] ?? const <WorkItem>[]) {
      final hasChildren = parentIds.contains(child.id);
      result.add(
        FlatTreeItem(item: child, depth: depth, hasChildren: hasChildren),
      );
      if (hasChildren && !collapsedIds.contains(child.id)) {
        visit(child.id, depth + 1);
      }
    }
  }

  visit(null, 0);
  return result;
}
