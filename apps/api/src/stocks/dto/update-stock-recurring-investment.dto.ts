import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FinanceRecurringHolidayAdjustment } from '../../../generated/prisma/client.js';

export class UpdateStockRecurringInvestmentDto {
  @IsOptional()
  @IsString()
  stockCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsEnum(FinanceRecurringHolidayAdjustment)
  holidayAdjustment?: FinanceRecurringHolidayAdjustment;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
