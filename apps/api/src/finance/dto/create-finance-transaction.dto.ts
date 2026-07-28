import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FinanceTransactionType } from '../../../generated/prisma/client.js';

export class CreateFinanceTransactionDto {
  @IsEnum(FinanceTransactionType)
  type: FinanceTransactionType;

  @IsNumber()
  @Min(0.01)
  amount: number;

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

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;
}
