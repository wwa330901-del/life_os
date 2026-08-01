import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FinanceRecurringHolidayAdjustment } from '../../../generated/prisma/client.js';

export class CreateStockRecurringInvestmentDto {
  @IsString()
  stockCode: string;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth: number;

  @IsOptional()
  @IsEnum(FinanceRecurringHolidayAdjustment)
  holidayAdjustment?: FinanceRecurringHolidayAdjustment;

  @IsString()
  accountId: string;
}
