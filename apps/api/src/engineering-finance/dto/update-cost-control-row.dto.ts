import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateCostControlRowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** 傳 null 可以解除跟採發比價表的連結。 */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  procurementComparisonId?: string | null;
}
