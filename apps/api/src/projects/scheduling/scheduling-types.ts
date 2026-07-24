// Plain input shapes for the pure scheduling engine — deliberately not
// Prisma models, so this whole `scheduling/` folder stays framework-free
// and portable (ported from reno_pm's Dart core, which has the same
// zero-Flutter-dependency property for the same reason).

export interface SchedulingWorkItem {
  id: string;
  name: string;
  /** Duration in working days. Must be >= 1 — enforced at the DTO layer. */
  durationDays: number;
  /** IDs of work items that must finish before this one can start. */
  predecessorIds: string[];
  /**
   * If set together with isManuallyPinned, the scheduler anchors this
   * item's start date here instead of computing it from predecessors.
   */
  manualStartDate: Date | null;
  isManuallyPinned: boolean;
  /** Parent work item id, or null for a top-level item. */
  parentId: string | null;
}

/**
 * Dart's `DateTime.monday..sunday` numbering (Monday=1 .. Sunday=7) — kept
 * consistent all the way down to the Prisma `weeklyOffDays Int[]` column
 * (see schema.prisma) so no translation table is needed anywhere.
 */
export interface HolidayCalendarInput {
  weeklyOffDays: number[];
  useTaiwanGovernmentCalendar: boolean;
  adHocHolidays: Date[];
  adHocWorkdays: Date[];
}

export interface SchedulingProject {
  projectStartDate: Date;
  calendar: HolidayCalendarInput;
  items: SchedulingWorkItem[];
}
