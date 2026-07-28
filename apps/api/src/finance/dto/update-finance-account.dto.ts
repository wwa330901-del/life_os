import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { FinanceAccountType } from '../../../generated/prisma/client.js';

export class UpdateFinanceAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(FinanceAccountType)
  type?: FinanceAccountType;

  @IsOptional()
  @IsNumber()
  initialBalance?: number;
}
