import { IsArray, IsString } from 'class-validator';

/** 整批覆蓋這一列勾選的報價單工項（不是逐筆加減）。 */
export class SetCostControlRowItemsDto {
  @IsArray()
  @IsString({ each: true })
  quotationLineItemIds: string[];
}
