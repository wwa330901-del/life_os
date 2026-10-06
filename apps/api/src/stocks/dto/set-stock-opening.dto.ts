import { IsNumber, IsString, Min } from 'class-validator';

export class SetStockOpeningDto {
  @IsString()
  stockCode: string;

  @IsNumber()
  @Min(0.0001)
  shares: number;

  /// 每股平均成本（券商 App 上看得到的「均價」）。
  @IsNumber()
  @Min(0)
  averageCost: number;
}
