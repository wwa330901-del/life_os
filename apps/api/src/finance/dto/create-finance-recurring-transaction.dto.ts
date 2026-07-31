import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  FinanceRecurringHolidayAdjustment,
  FinanceTransactionType,
} from '../../../generated/prisma/client.js';

export class CreateFinanceRecurringTransactionDto {
  @IsEnum(FinanceTransactionType)
  type: FinanceTransactionType;

  /// Leave unset for a variable amount (e.g. a credit card bill) — the due
  /// day just sends a LINE reminder instead of auto-recording a guess.
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsString()
  accountId: string;

  /// Only meaningful (and required) when `type` is TRANSFER.
  @IsOptional()
  @IsString()
  toAccountId?: string;

  /// Ignored when `type` is TRANSFER.
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth: number;

  /// How to shift the trigger date when it lands on a weekend or Taiwan
  /// government holiday. Defaults to NONE (don't adjust) if omitted.
  @IsOptional()
  @IsEnum(FinanceRecurringHolidayAdjustment)
  holidayAdjustment?: FinanceRecurringHolidayAdjustment;

  @IsOptional()
  @IsString()
  note?: string;
}
