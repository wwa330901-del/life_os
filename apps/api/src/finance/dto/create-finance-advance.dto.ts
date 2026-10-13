import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateFinanceAdvanceDto {
  @IsString()
  @MinLength(1)
  title: string;

  /// 一般代墊＝這次墊的金額；期初代墊（opening）＝現在還沒收回多少。
  @IsNumber()
  @Min(0.01)
  amount: number;

  /// 期初代墊（開始記帳前就墊出去的）：不動任何帳戶，accountId 不用填。
  @IsOptional()
  @IsBoolean()
  opening?: boolean;

  @ValidateIf((o: CreateFinanceAdvanceDto) => !o.opening)
  @IsString()
  accountId?: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;
}
