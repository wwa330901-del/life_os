import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCostControlRowDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  procurementComparisonId?: string;
}
