// Orders work items so every item comes after all of its predecessors,
// using Kahn's algorithm. Cycles and dangling predecessor references are
// reported as non-fatal SchedulingIssues rather than thrown exceptions, so
// one bad dependency link never blanks out the whole Gantt chart. Ported
// from reno_pm's topo_sort.dart.

import { SchedulingIssue, SchedulingIssueType } from './schedule-result';
import { SchedulingWorkItem } from './scheduling-types';

export interface TopoSortResult {
  /** Work item IDs in dependency order. Items involved in a cycle are excluded. */
  sortedIds: string[];
  issues: SchedulingIssue[];
}

export function topoSort(items: SchedulingWorkItem[]): TopoSortResult {
  const ids = new Set(items.map((i) => i.id));
  const inDegree = new Map<string, number>(items.map((i) => [i.id, 0]));
  const adjacency = new Map<string, string[]>(items.map((i) => [i.id, []]));
  const issues: SchedulingIssue[] = [];

  for (const item of items) {
    for (const predId of item.predecessorIds) {
      if (!ids.has(predId)) {
        issues.push({
          type: SchedulingIssueType.DanglingPredecessor,
          involvedWorkItemIds: [item.id],
          message: `工項「${item.name}」的前置工項不存在,已略過該相依關係`,
        });
        continue;
      }
      adjacency.get(predId)!.push(item.id);
      inDegree.set(item.id, inDegree.get(item.id)! + 1);
    }
  }

  // Seed with items in their given (stable) order so output is deterministic.
  const queue: string[] = [];
  for (const item of items) {
    if (inDegree.get(item.id) === 0) queue.push(item.id);
  }

  const sorted: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    sorted.push(id);
    for (const next of adjacency.get(id)!) {
      inDegree.set(next, inDegree.get(next)! - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  if (sorted.length < items.length) {
    const sortedSet = new Set(sorted);
    const remaining = [...ids].filter((id) => !sortedSet.has(id));
    issues.push({
      type: SchedulingIssueType.CycleDetected,
      involvedWorkItemIds: remaining,
      message: `偵測到循環相依關係,以下 ${remaining.length} 個工項無法排程`,
    });
  }

  return { sortedIds: sorted, issues };
}
