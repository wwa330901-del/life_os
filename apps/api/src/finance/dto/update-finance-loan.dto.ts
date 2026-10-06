import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { LoanInstallmentFields } from './loan-installment-fields';

export class UpdateFinanceLoanDto extends LoanInstallmentFields {
  @IsOptional()
  @IsString()
  @MinLength(1)
  counterpartyName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /// 約定還款日 YYYY-MM-DD；null＝清掉。
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;
}
