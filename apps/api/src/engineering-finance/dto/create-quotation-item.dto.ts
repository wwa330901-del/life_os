import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateQuotationItemDto {
  /** 不給表示是頂層大項；給了就掛在該工項底下（大項/中項/細項不限層數）。 */
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  unit?: string;

  /** 通常只有最底層細項才會填 quantity/unitPrice/costUnitPrice——大項/中項
   * 留空，金額由底下細項現算彙總。三者不強制同時給，讓使用者可以先建架構
   * 再慢慢補金額。 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costUnitPrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
