import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/** 每月固定還款（學貸、分期）：三個一起填才會自動記；installmentAmount 給 null＝取消。 */
export class LoanInstallmentFields {
  @IsOptional()
  @IsNumber()
  @Min(1)
  installmentAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  installmentDay?: number | null;

  @IsOptional()
  @IsString()
  installmentAccountId?: string | null;
}
