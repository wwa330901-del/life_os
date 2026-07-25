import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { scheduleProject } from './scheduling/gantt-scheduler';
import { HolidayCalendarInput, SchedulingWorkItem } from './scheduling/scheduling-types';

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

    const items = await this.prisma.workItem.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });

    return { project, items, schedule: this.compute(project, items) };
  }

  private compute(
    project: { projectStartDate: Date } & HolidayCalendarInput,
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

    return {
      tasks: [...result.byId.values()],
      topologicalOrder: result.topologicalOrder,
      issues: result.issues,
    };
  }
}
