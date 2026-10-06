import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

/** 財務規劃前問使用者的（每月收入、固定支出、想法）；都不帶＝照上次存的。 */
export class FinancePlanAnswersDto {
  @IsOptional()
  @IsNumber()
  monthlyIncome?: number | null;

  /// [{ name, amount }]，內容由 finance-plan-profile.ts 清理。
  @IsOptional()
  @IsArray()
  fixedExpenses?: Array<{ name?: unknown; amount?: unknown }>;

  @IsOptional()
  @IsString()
  thoughts?: string | null;
}
