import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
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

  /// 每期預計投入的金額——到期只需要回覆成交價，系統用這個金額換算整股數。
  @IsNumber()
  @Min(0.01)
  monthlyAmount: number;
}
