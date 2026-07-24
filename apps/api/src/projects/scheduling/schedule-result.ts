// Output of the scheduling engine. Never persisted — always recomputed fresh
// from a project's work items on every read, so it can never drift out of
// sync with its input. Ported from reno_pm's schedule_result.dart.

export interface ScheduledTask {
  workItemId: string;
  start: Date;
  /** Inclusive end date. */
  end: Date;
}

export enum SchedulingIssueType {
  CycleDetected = 'cycleDetected',
  DanglingPredecessor = 'danglingPredecessor',
}

export interface SchedulingIssue {
  type: SchedulingIssueType;
  involvedWorkItemIds: string[];
  message: string;
}

export interface ScheduleResult {
  byId: Map<string, ScheduledTask>;
  topologicalOrder: string[];
  issues: SchedulingIssue[];
}

export function hasIssues(result: ScheduleResult): boolean {
  return result.issues.length > 0;
}
