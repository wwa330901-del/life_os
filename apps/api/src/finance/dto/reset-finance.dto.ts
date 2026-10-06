import { Type } from 'class-transformer';
import { Equals, IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ResetFinanceBalanceDto {
  @IsString()
  accountId: string;

  @IsNumber()
  balance: number;
}

/// 清空記帳重來。confirm 要是「清空」，防止誤觸。
export class ResetFinanceDto {
  @Equals('清空')
  confirm: string;

  /// true＝連帳戶、分類、預算、定期交易、定期定額都刪（分類下次打開會重建預設）；
  /// false＝只刪紀錄，帳戶等設定留著。
  @IsBoolean()
  deleteSetup: boolean;

  /// 只刪紀錄時：每個帳戶清空後的餘額（沒給的帳戶維持現在的餘額）。
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResetFinanceBalanceDto)
  balances?: ResetFinanceBalanceDto[];
}
