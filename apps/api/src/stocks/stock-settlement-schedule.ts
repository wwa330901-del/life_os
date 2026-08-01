// Pure T+2 settlement-date math for stock transactions — mirrors Taiwan's
// real cash settlement (2 trading days after trade date, skipping weekends
// and Taiwan government holidays). Kept dependency-free like
// finance-recurring-schedule.ts, reusing the working-day engine 工期表
// scheduling already built.

import { addWorkingDays } from '../projects/scheduling/working-day-calculator';
import { HolidayCalendarInput } from '../projects/scheduling/scheduling-types';

/** Standard Taiwan market calendar: weekends off + government holidays, no
 * per-project ad-hoc overrides — the same days TWSE itself is closed. */
export const TAIWAN_MARKET_CALENDAR: HolidayCalendarInput = {
  weeklyOffDays: [6, 7], // Saturday, Sunday (Dart weekday numbering)
  useTaiwanGovernmentCalendar: true,
  adHocHolidays: [],
  adHocWorkdays: [],
};

/** T+2: 2 trading days after tradeDate. addWorkingDays doesn't require
 * tradeDate itself to be a trading day — it just counts forward from it —
 * so this stays correct even for a backfilled non-trading-day entry. */
export function computeSettlementDate(tradeDate: Date): Date {
  return addWorkingDays(tradeDate, 2, TAIWAN_MARKET_CALENDAR);
}
