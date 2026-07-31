import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  FinanceRecurringHolidayAdjustment,
  FinanceTransactionType,
} from '../../../generated/prisma/client.js';

export class UpdateFinanceRecurringTransactionDto {
  @IsOptional()
  @IsEnum(FinanceTransactionType)
  type?: FinanceTransactionType;

  /// Omit to leave unchanged; `null` clears it back to "variable amount"
  /// (reminder-only); a number sets/replaces the fixed auto-record amount.
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number | null;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  toAccountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

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
  note?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
