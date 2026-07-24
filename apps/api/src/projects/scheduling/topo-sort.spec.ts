// Ported 1:1 from reno_pm's topo_sort_test.dart.

import { topoSort } from './topo-sort';
import { SchedulingIssueType } from './schedule-result';
import { SchedulingWorkItem } from './scheduling-types';

function item(id: string, preds: string[] = []): SchedulingWorkItem {
  return {
    id,
    name: id,
    durationDays: 1,
    predecessorIds: preds,
    manualStartDate: null,
    isManuallyPinned: false,
    parentId: null,
  };
}

describe('topoSort', () => {
  it('linear chain orders items after their predecessors', () => {
    const a = item('A');
    const b = item('B', ['A']);
    const c = item('C', ['B']);

    const result = topoSort([a, b, c]);

    expect(result.issues).toHaveLength(0);
    expect(result.sortedIds).toEqual(['A', 'B', 'C']);
  });

  it('diamond dependency: D depends on both B and C, which depend on A', () => {
    const a = item('A');
    const b = item('B', ['A']);
    const c = item('C', ['A']);
    const dItem = item('D', ['B', 'C']);

    const result = topoSort([a, b, c, dItem]);

    expect(result.issues).toHaveLength(0);
    expect(result.sortedIds.indexOf('A')).toBeLessThan(result.sortedIds.indexOf('B'));
    expect(result.sortedIds.indexOf('A')).toBeLessThan(result.sortedIds.indexOf('C'));
    expect(result.sortedIds.indexOf('B')).toBeLessThan(result.sortedIds.indexOf('D'));
    expect(result.sortedIds.indexOf('C')).toBeLessThan(result.sortedIds.indexOf('D'));
    expect(result.sortedIds).toHaveLength(4);
  });

  it('self-cycle is reported and excludes the item from scheduling', () => {
    const a = item('A', ['A']);

    const result = topoSort([a]);

    expect(result.sortedIds).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe(SchedulingIssueType.CycleDetected);
    expect(result.issues[0].involvedWorkItemIds).toEqual(['A']);
  });

  it('multi-node cycle excludes only the cyclic items, rest still schedule', () => {
    const a = item('A', ['B']);
    const b = item('B', ['A']);
    const c = item('C'); // unrelated, no deps

    const result = topoSort([a, b, c]);

    expect(result.sortedIds).toEqual(['C']);
    const cycleIssue = result.issues.find((i) => i.type === SchedulingIssueType.CycleDetected)!;
    expect(new Set(cycleIssue.involvedWorkItemIds)).toEqual(new Set(['A', 'B']));
  });

  it('disconnected components each order correctly', () => {
    const a = item('A');
    const b = item('B');
    const c = item('C', ['B']);

    const result = topoSort([a, b, c]);

    expect(result.issues).toHaveLength(0);
    expect(new Set(result.sortedIds)).toEqual(new Set(['A', 'B', 'C']));
    expect(result.sortedIds.indexOf('B')).toBeLessThan(result.sortedIds.indexOf('C'));
  });

  it('dangling predecessor reference is reported but item still schedules', () => {
    const a = item('A', ['does-not-exist']);

    const result = topoSort([a]);

    expect(result.sortedIds).toEqual(['A']);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe(SchedulingIssueType.DanglingPredecessor);
    expect(result.issues[0].involvedWorkItemIds).toEqual(['A']);
  });

  it('empty predecessor list schedules independently', () => {
    const a = item('A');

    const result = topoSort([a]);

    expect(result.sortedIds).toEqual(['A']);
    expect(result.issues).toHaveLength(0);
  });
});
