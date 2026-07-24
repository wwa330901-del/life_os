// Ported from reno_pm's work_item_hierarchy.dart — only groupByParent and
// parentItemIds are needed server-side for parent/summary aggregation.
// flattenTree/FlatTreeItem is a UI tree-flattening concern for the task
// table's collapse/expand rendering and stays client-side (Flutter) only.

import { SchedulingWorkItem } from './scheduling-types';

/**
 * Groups `items` by their parentId. The `null` key holds every top-level
 * item. Each group is sorted the same way the caller passed them in (callers
 * are expected to pass items pre-sorted by sortOrder, mirroring the source
 * app's WorkItem.sortOrder-based sort — kept minimal here since only
 * min-start/max-end aggregation needs this, which is sort-order-independent).
 */
export function groupByParent(
  items: SchedulingWorkItem[],
): Map<string | null, SchedulingWorkItem[]> {
  const map = new Map<string | null, SchedulingWorkItem[]>();
  for (const item of items) {
    const key = item.parentId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

/**
 * IDs of items that have at least one child — i.e. summary/母項目 rows whose
 * schedule is an aggregate of their descendants rather than their own
 * duration/predecessors. Whether an item is a parent is always derived this
 * way, never stored, so a leaf automatically becomes a summary row the
 * moment something is nested under it.
 */
export function parentItemIds(items: SchedulingWorkItem[]): Set<string> {
  const result = new Set<string>();
  for (const item of items) {
    if (item.parentId != null) result.add(item.parentId);
  }
  return result;
}
