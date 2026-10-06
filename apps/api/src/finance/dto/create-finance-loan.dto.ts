import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';
import { FinanceLoanDirection } from '../../../generated/prisma/client.js';
import { LoanInstallmentFields } from './loan-installment-fields';

export class CreateFinanceLoanDto extends LoanInstallmentFields {
  @IsEnum(FinanceLoanDirection)
  direction: FinanceLoanDirection;

  @IsString()
  @MinLength(1)
  counterpartyName: string;

  /// 一般借貸＝這次借的金額；期初借貸（opening）＝現在還欠多少。
  @IsNumber()
  @Min(0.01)
  amount: number;

  /// 期初借貸（之前就欠的，例如學貸）：不動任何帳戶，accountId 不用填。
  @IsOptional()
  @IsBoolean()
  opening?: boolean;

  @ValidateIf((o: CreateFinanceLoanDto) => !o.opening)
  @IsString()
  accountId?: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;

  /// 約定還款日 YYYY-MM-DD（可不填）。
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
