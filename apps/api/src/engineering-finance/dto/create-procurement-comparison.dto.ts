import { IsString, MinLength } from 'class-validator';

export class CreateProcurementComparisonDto {
  @IsString()
  @MinLength(1)
  scopeName: string;
}
