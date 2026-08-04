import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { FinanceLoanDirection } from '../../../generated/prisma/client.js';

export class CreateFinanceLoanDto {
  @IsEnum(FinanceLoanDirection)
  direction: FinanceLoanDirection;

  @IsString()
  @MinLength(1)
  counterpartyName: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  accountId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;
}
