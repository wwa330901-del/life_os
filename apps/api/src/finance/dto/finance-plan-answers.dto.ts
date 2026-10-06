import { Allow } from 'class-validator';

/** 財務規劃問卷的答案（七大類，見 finance-plan-profile.ts）；都不帶＝照上次存的。
 * 格式檢查跟清理在 finance-plan-profile.ts 的 CLEAN，這裡只負責讓欄位通過 whitelist。 */
export class FinancePlanAnswersDto {
  @Allow() monthlyIncome?: unknown;
  @Allow() payDay?: unknown;
  @Allow() otherIncome?: unknown;
  @Allow() incomeStability?: unknown;
  @Allow() incomeChangeNote?: unknown;
  @Allow() fixedExpenses?: unknown;
  @Allow() annualExpenses?: unknown;
  @Allow() livingExpense?: unknown;
  @Allow() emergencyMonths?: unknown;
  @Allow() otherAssets?: unknown;
  @Allow() goals?: unknown;
  @Allow() savingTarget?: unknown;
  @Allow() savingRate?: unknown;
  @Allow() priorities?: unknown;
  @Allow() riskProfile?: unknown;
  @Allow() cutBack?: unknown;
  @Allow() thoughts?: unknown;
}
