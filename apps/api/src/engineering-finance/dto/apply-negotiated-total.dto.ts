import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** B方案：業主殺價後輸入議定總金額，依比例回推 negotiatedUnitPrice（不覆蓋
 * unitPrice）。 */
export class ApplyNegotiatedTotalDto {
  @IsNumber()
  @Min(0)
  negotiatedTotalAmount: number;

  /** 不給就套用整份報價單所有有填單價的細項。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}
