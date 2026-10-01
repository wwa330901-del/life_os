import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
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

  // 信用卡（null＝清掉）
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  statementDay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDueDay?: number | null;

  @IsOptional()
  @IsString()
  paymentAccountId?: string | null;

  @IsOptional()
  @IsBoolean()
  cardAutoPay?: boolean;
}
