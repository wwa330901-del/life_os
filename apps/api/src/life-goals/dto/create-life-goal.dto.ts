import { IsDateString, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateLifeGoalDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  targetValue?: number;

  @IsOptional()
  @IsNumber()
  currentValue?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}
