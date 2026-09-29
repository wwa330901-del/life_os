/**
 * Dart's `DateTime.monday..sunday` numbering (Monday=1 .. Sunday=7) — kept
 * consistent all the way down to the Prisma `weeklyOffDays Int[]` column
 * used by the engineering-scheduling code this was ported from (see
 * archive/company-space-v2.9.36) so no translation table is needed
 * anywhere. Only 個人 code (finance 定期交易／股票 T+2 交割) reuses this
 * holiday-calendar arithmetic now that 公司空間's own scheduler has been
 * split out.
 */
export interface HolidayCalendarInput {
  weeklyOffDays: number[];
  useTaiwanGovernmentCalendar: boolean;
  adHocHolidays: Date[];
  adHocWorkdays: Date[];
}
