import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { FinanceAccountType } from '../../../generated/prisma/client.js';

export class CreateFinanceAccountDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(FinanceAccountType)
  type: FinanceAccountType;

  @IsOptional()
  @IsNumber()
  initialBalance?: number;
}
