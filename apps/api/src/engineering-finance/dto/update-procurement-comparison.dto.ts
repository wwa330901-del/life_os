import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProcurementComparisonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  scopeName?: string;
}
