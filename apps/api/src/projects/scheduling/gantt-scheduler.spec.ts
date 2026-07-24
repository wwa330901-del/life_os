// Ported 1:1 from reno_pm's scheduler_test.dart — the highest-value test
// file to keep byte-for-byte equivalent, since multi-client consistency
// depends on it.

import { scheduleProject } from './gantt-scheduler';
import { SchedulingProject, SchedulingWorkItem } from './scheduling-types';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const cal = {
  weeklyOffDays: [7], // Sunday
  useTaiwanGovernmentCalendar: false,
  adHocHolidays: [] as Date[],
  adHocWorkdays: [] as Date[],
};

function item(overrides: Partial<SchedulingWorkItem> & { id: string; name: string; durationDays: number }): SchedulingWorkItem {
  return {
    predecessorIds: [],
    manualStartDate: null,
    isManuallyPinned: false,
    parentId: null,
    ...overrides,
  };
}

function project(items: SchedulingWorkItem[], start?: Date): SchedulingProject {
  return {
    projectStartDate: start ?? d(2024, 1, 1), // Monday
    calendar: cal,
    items,
  };
}

describe('GanttScheduler', () => {
  it('single item with no predecessors starts at the project baseline', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 5 });
    const result = scheduleProject(project([a]));

    expect(result.byId.get('A')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('A')!.end).toEqual(d(2024, 1, 5));
  });

  it('linear finish-to-start chain cascades each item after the last', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 3 });
    const b = item({ id: 'B', name: 'B', durationDays: 2, predecessorIds: ['A'] });
    const c = item({ id: 'C', name: 'C', durationDays: 1, predecessorIds: ['B'] });

    const result = scheduleProject(project([a, b, c]));

    expect(result.byId.get('A')!.start).toEqual(d(2024, 1, 1)); // Mon
    expect(result.byId.get('A')!.end).toEqual(d(2024, 1, 3)); // Wed
    expect(result.byId.get('B')!.start).toEqual(d(2024, 1, 4)); // Thu
    expect(result.byId.get('B')!.end).toEqual(d(2024, 1, 5)); // Fri
    expect(result.byId.get('C')!.start).toEqual(d(2024, 1, 6)); // Sat
    expect(result.byId.get('C')!.end).toEqual(d(2024, 1, 6)); // Sat, 1-day duration
  });

  it('diamond convergence starts D after the later of its two predecessors', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 2 });
    const b = item({ id: 'B', name: 'B', durationDays: 3, predecessorIds: ['A'] });
    const c = item({ id: 'C', name: 'C', durationDays: 1, predecessorIds: ['A'] });
    const dItem = item({ id: 'D', name: 'D', durationDays: 1, predecessorIds: ['B', 'C'] });

    const result = scheduleProject(project([a, b, c, dItem]));

    expect(result.byId.get('B')!.end).toEqual(d(2024, 1, 5)); // Fri
    expect(result.byId.get('C')!.end).toEqual(d(2024, 1, 3)); // Wed
    // D must start after the LATER predecessor (B), not the earlier (C).
    expect(result.byId.get('D')!.start).toEqual(d(2024, 1, 6)); // Sat
  });

  it('manually pinning a mid-chain item shifts only downstream items', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 2 });
    const b = item({
      id: 'B',
      name: 'B',
      durationDays: 2,
      predecessorIds: ['A'],
      manualStartDate: d(2024, 2, 1), // Thursday, far from A's natural date
      isManuallyPinned: true,
    });
    const c = item({ id: 'C', name: 'C', durationDays: 2, predecessorIds: ['B'] });

    const result = scheduleProject(project([a, b, c]));

    // A is computed independently of B's pin.
    expect(result.byId.get('A')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('A')!.end).toEqual(d(2024, 1, 2));

    // B honors the pin instead of following A.
    expect(result.byId.get('B')!.start).toEqual(d(2024, 2, 1));
    expect(result.byId.get('B')!.end).toEqual(d(2024, 2, 2));

    // C cascades from B's new (pinned-derived) end date.
    expect(result.byId.get('C')!.start).toEqual(d(2024, 2, 3));
    expect(result.byId.get('C')!.end).toEqual(d(2024, 2, 5));
  });

  it('project start date falling on an off-day rolls forward', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 1 });
    const result = scheduleProject(project([a], d(2024, 1, 7))); // Sunday

    expect(result.byId.get('A')!.start).toEqual(d(2024, 1, 8)); // Monday
    expect(result.byId.get('A')!.end).toEqual(d(2024, 1, 8));
  });

  it('a dependency cycle is reported and the rest of the project still schedules', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 1, predecessorIds: ['B'] });
    const b = item({ id: 'B', name: 'B', durationDays: 1, predecessorIds: ['A'] });
    const c = item({ id: 'C', name: 'C', durationDays: 1 });

    const result = scheduleProject(project([a, b, c]));

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.byId.has('C')).toBe(true);
    expect(result.byId.has('A')).toBe(false);
    expect(result.byId.has('B')).toBe(false);
  });
});

describe('GanttScheduler parent (母項目) summary rows', () => {
  it('a parent spans the earliest start to latest end of its children', () => {
    const child1 = item({ id: 'child1', name: 'child1', durationDays: 2, parentId: 'P' });
    const child2 = item({
      id: 'child2',
      name: 'child2',
      durationDays: 3,
      predecessorIds: ['child1'],
      parentId: 'P',
    });
    const parent = item({ id: 'P', name: 'P', durationDays: 1 });

    const result = scheduleProject(project([parent, child1, child2]));

    expect(result.byId.get('child1')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('child1')!.end).toEqual(d(2024, 1, 2));
    expect(result.byId.get('child2')!.end).toEqual(d(2024, 1, 5));

    expect(result.byId.get('P')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('P')!.end).toEqual(d(2024, 1, 5));
  });

  it('nested parents aggregate recursively through multiple levels', () => {
    const leaf = item({ id: 'leaf', name: 'leaf', durationDays: 2, parentId: 'mid' });
    const sibling = item({ id: 'sibling', name: 'sibling', durationDays: 1, parentId: 'top' });
    const mid = item({ id: 'mid', name: 'mid', durationDays: 1, parentId: 'top' });
    const top = item({ id: 'top', name: 'top', durationDays: 1 });

    const result = scheduleProject(project([top, mid, leaf, sibling]));

    // leaf: Mon(0) Tue(1) -> 2024-01-02
    expect(result.byId.get('leaf')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('leaf')!.end).toEqual(d(2024, 1, 2));
    // mid's only child is leaf, so mid == leaf's span.
    expect(result.byId.get('mid')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('mid')!.end).toEqual(d(2024, 1, 2));
    // sibling: single day, starts at project baseline too.
    expect(result.byId.get('sibling')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('sibling')!.end).toEqual(d(2024, 1, 1));
    // top spans across both its direct children (mid and sibling).
    expect(result.byId.get('top')!.start).toEqual(d(2024, 1, 1));
    expect(result.byId.get('top')!.end).toEqual(d(2024, 1, 2));
  });

  it('a cycle in the parent/child structure is reported and excluded', () => {
    const a = item({ id: 'A', name: 'A', durationDays: 1, parentId: 'B' });
    const b = item({ id: 'B', name: 'B', durationDays: 1, parentId: 'A' });

    const result = scheduleProject(project([a, b]));

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.byId.has('A')).toBe(false);
    expect(result.byId.has('B')).toBe(false);
  });

  it('a leaf depending on a parent id is treated as a dangling reference', () => {
    const child = item({ id: 'child', name: 'child', durationDays: 1, parentId: 'P' });
    const parent = item({ id: 'P', name: 'P', durationDays: 1 });
    const leaf = item({ id: 'L', name: 'L', durationDays: 1, predecessorIds: ['P'] });

    const result = scheduleProject(project([parent, child, leaf]));

    expect(result.issues.length).toBeGreaterThan(0);
    // Falls back to the project baseline rather than being left unscheduled.
    expect(result.byId.get('L')!.start).toEqual(d(2024, 1, 1));
  });
});
