import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateQuotationItemDto {
  /** 傳 null 可以把這個工項變成頂層大項；不傳就不動。 */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  unit?: string;

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
