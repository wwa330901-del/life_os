import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FinanceTransactionType } from '../../../generated/prisma/client.js';

export class UpdateFinanceTransactionDto {
  @IsOptional()
  @IsEnum(FinanceTransactionType)
  type?: FinanceTransactionType;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

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
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
