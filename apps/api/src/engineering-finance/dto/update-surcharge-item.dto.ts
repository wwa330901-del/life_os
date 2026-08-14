import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateSurchargeItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  percent?: number;

  @IsOptional()
  @IsBoolean()
  isTaxLike?: boolean;
}
