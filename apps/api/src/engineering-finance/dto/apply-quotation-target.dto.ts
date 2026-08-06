import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ApplyQuotationTargetDto {
  @IsIn(['MARGIN', 'TOTAL'])
  mode: 'MARGIN' | 'TOTAL';

  /** MARGIN 模式必填，0~1 之間（例如 0.2 代表 20%）。 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetMarginRate?: number;

  /** TOTAL 模式必填。 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetTotalAmount?: number;

  /** 不給就套用到整張報價單所有工項。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}
