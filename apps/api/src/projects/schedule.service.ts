import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { scheduleProject } from './scheduling/gantt-scheduler';
import { HolidayCalendarInput, SchedulingWorkItem } from './scheduling/scheduling-types';
import { SchedulingIssue, SchedulingIssueType } from './scheduling/schedule-result';
import type { Project } from '../../generated/prisma/client.js';

// The only place that touches both Prisma and the pure scheduler. Schedule
// dates are never written back to the database — computed fresh on every
// read so every client sees identical dates, which is the multi-client
// consistency guarantee the whole server-side move exists for.
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getSchedule(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const items = await this.prisma.workItem.findMany({ where: { projectId } });
    return this.compute(project, items);
  }

  /**
   * Project + items + computed schedule in one round trip, authorizing
   * once instead of three times. The schedule tab used to hit
   * `getProject`/`listWorkItems`/`getSchedule` separately after every edit
   * (even run concurrently client-side, each one re-walks the same
   * project→space→membership access check from scratch) — every one of
   * those DB round trips adds up when the database isn't in the same
   * region as the API, which is most of why editing still felt slow after
   * parallelizing the three client-side requests didn't fully fix it.
   */
  async getEditorState(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return this.buildEditorState(project);
  }

  /**
   * Same project+items+schedule bundle as `getEditorState`, but for a
   * caller (e.g. `WorkItemsService`) that already fetched and authorized
   * `project` itself as part of its own mutation — letting a work-item
   * write return the fresh editor state directly instead of the client
   * needing a second `getEditorState` round trip right after, which used
   * to double both the network latency and the repeated access-check
   * queries on every single edit.
   */
  async buildEditorState(project: Project) {
    const items = await this.prisma.workItem.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'asc' },
    });
    return { project, items, schedule: this.compute(project, items) };
  }

  private compute(
    project: { projectStartDate: Date; projectEndDate: Date | null } & HolidayCalendarInput,
    items: {
      id: string;
      name: string;
      durationDays: number;
      predecessorIds: string[];
      manualStartDate: Date | null;
      isManuallyPinned: boolean;
      parentId: string | null;
    }[],
  ) {
    const schedulingItems: SchedulingWorkItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      durationDays: item.durationDays,
      predecessorIds: item.predecessorIds,
      manualStartDate: item.manualStartDate,
      isManuallyPinned: item.isManuallyPinned,
      parentId: item.parentId,
    }));

    const result = scheduleProject({
      projectStartDate: project.projectStartDate,
      calendar: {
        weeklyOffDays: project.weeklyOffDays,
        useTaiwanGovernmentCalendar: project.useTaiwanGovernmentCalendar,
        adHocHolidays: project.adHocHolidays,
        adHocWorkdays: project.adHocWorkdays,
      },
      items: schedulingItems,
    });

    const issues: SchedulingIssue[] = [...result.issues];
    if (project.projectEndDate) {
      const deadline = project.projectEndDate;
      let forecastEnd: Date | null = null;
      for (const task of result.byId.values()) {
        if (!forecastEnd || task.end > forecastEnd) forecastEnd = task.end;
      }
      if (forecastEnd && forecastEnd > deadline) {
        issues.push({
          type: SchedulingIssueType.ExceedsContractDeadline,
          involvedWorkItemIds: [...result.byId.values()]
            .filter((task) => task.end.getTime() === forecastEnd!.getTime())
            .map((task) => task.workItemId),
          message: `工期預估已超出合約完工日（合約：${formatDate(deadline)}，目前預估完工：${formatDate(forecastEnd)}）`,
        });
      }
    }

    return {
      tasks: [...result.byId.values()],
      topologicalOrder: result.topologicalOrder,
      issues,
    };
  }
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}
