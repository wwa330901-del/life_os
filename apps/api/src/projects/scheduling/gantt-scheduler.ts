// Forward, finish-to-start (0 lag) scheduling engine. Always recomputes the
// full ScheduleResult from a project's items rather than patching
// incrementally — with realistic project sizes (tens to low hundreds of
// items) this is fast and correctness-by-construction: any edit just
// reflows downstream through the topological order.
//
// Parent (母項目) items are handled separately from leaves: only leaf items
// (no children) participate in the duration/dependency forward pass below.
// A parent's schedule is always a derived summary spanning the earliest
// start to the latest end of its descendants, computed recursively after
// the leaf pass — so dependencies should be set between leaf items, not on
// summary rows (a predecessor id pointing at a parent is reported as a
// dangling reference, same as any other unresolved id).
//
// Ported from reno_pm's scheduler.dart. This is the file every client's
// consistency depends on now that scheduling happens server-side — see
// gantt-scheduler.spec.ts for the ported test suite.

import {
  ScheduleResult,
  ScheduledTask,
  SchedulingIssue,
  SchedulingIssueType,
} from './schedule-result';
import { SchedulingProject, SchedulingWorkItem } from './scheduling-types';
import { groupByParent, parentItemIds } from './work-item-hierarchy';
import { topoSort } from './topo-sort';
import {
  nextWorkingDay,
  rollForwardToWorkingDay,
  addWorkingDays,
} from './working-day-calculator';

export function scheduleProject(project: SchedulingProject): ScheduleResult {
  const items = project.items;
  const parentIds = parentItemIds(items);
  const leaves = items.filter((i) => !parentIds.has(i.id));
  const parents = items.filter((i) => parentIds.has(i.id));

  const order = topoSort(leaves);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const results = new Map<string, ScheduledTask>();

  for (const id of order.sortedIds) {
    const item = itemsById.get(id)!;
    let start: Date;

    if (item.isManuallyPinned && item.manualStartDate != null) {
      start = item.manualStartDate;
    } else if (item.predecessorIds.length === 0) {
      start = project.projectStartDate;
    } else {
      const predEnds = item.predecessorIds
        .map((predId) => results.get(predId)?.end)
        .filter((date): date is Date => date != null);
      if (predEnds.length === 0) {
        // All predecessors were excluded (e.g. part of a dependency cycle);
        // fall back to the project baseline rather than leaving this item
        // unscheduled.
        start = project.projectStartDate;
      } else {
        const latestEnd = predEnds.reduce((a, b) =>
          a.getTime() > b.getTime() ? a : b,
        );
        start = nextWorkingDay(latestEnd, project.calendar);
      }
    }

    start = rollForwardToWorkingDay(start, project.calendar);
    const end = addWorkingDays(start, item.durationDays - 1, project.calendar);
    results.set(id, { workItemId: id, start, end });
  }

  const issues = [...order.issues];
  aggregateParents(parents, items, results, issues);

  return { byId: results, topologicalOrder: order.sortedIds, issues };
}

function aggregateParents(
  parents: SchedulingWorkItem[],
  allItems: SchedulingWorkItem[],
  results: Map<string, ScheduledTask>,
  issues: SchedulingIssue[],
): void {
  const childrenByParent = groupByParent(allItems);
  const aggregateCache = new Map<string, ScheduledTask | null>();
  const visiting = new Set<string>();
  const itemsById = new Map(allItems.map((i) => [i.id, i]));

  function aggregateFor(itemId: string): ScheduledTask | null {
    const leafResult = results.get(itemId);
    if (leafResult) return leafResult;
    if (aggregateCache.has(itemId)) return aggregateCache.get(itemId)!;
    if (visiting.has(itemId)) return null; // hierarchy cycle guard

    visiting.add(itemId);
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    for (const child of childrenByParent.get(itemId) ?? []) {
      const childSchedule = aggregateFor(child.id);
      if (!childSchedule) continue;
      if (minStart == null || childSchedule.start.getTime() < minStart.getTime()) {
        minStart = childSchedule.start;
      }
      if (maxEnd == null || childSchedule.end.getTime() > maxEnd.getTime()) {
        maxEnd = childSchedule.end;
      }
    }
    visiting.delete(itemId);

    const aggregate: ScheduledTask | null =
      minStart != null && maxEnd != null
        ? { workItemId: itemId, start: minStart, end: maxEnd }
        : null;
    aggregateCache.set(itemId, aggregate);
    return aggregate;
  }

  for (const parent of parents) {
    const aggregate = aggregateFor(parent.id);
    if (aggregate) {
      results.set(parent.id, aggregate);
    } else {
      const name = itemsById.get(parent.id)?.name ?? parent.id;
      issues.push({
        type: SchedulingIssueType.CycleDetected,
        involvedWorkItemIds: [parent.id],
        message: `工項「${name}」的子項目結構有循環相依,或沒有可排程的子項目`,
      });
    }
  }
}
