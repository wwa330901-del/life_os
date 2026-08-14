import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

/** A方案：設定目標毛利率，回推 marginAdjustedUnitPrice（不覆蓋 unitPrice）。 */
export class ApplyMarginTargetDto {
  @IsNumber()
  targetMarginPercent: number;

  /** 不給就套用整份報價單所有有填成本的細項。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}
