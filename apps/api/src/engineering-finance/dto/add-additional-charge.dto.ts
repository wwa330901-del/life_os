import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

/** multipart 表單一起送——金額欄位 + file 欄位（追加報價單附件）。 */
export class AddAdditionalChargeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;
}
