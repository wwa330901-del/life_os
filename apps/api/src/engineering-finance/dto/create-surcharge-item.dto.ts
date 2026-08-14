import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSurchargeItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  percent: number;

  /** true=稅金這種特例，計算基礎是「工程總金額＋其他附加費用」加總後才乘
   * percent；false（預設）=一般附加費用，基礎只有工程總金額。 */
  @IsOptional()
  @IsBoolean()
  isTaxLike?: boolean;
}
