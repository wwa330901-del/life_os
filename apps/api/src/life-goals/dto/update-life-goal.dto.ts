import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { LifeGoalStatus } from '../../../generated/prisma/client.js';

// Every field optional; nullable fields (notes/category/targetValue/
// currentValue/unit/targetDate) accept an explicit `null` to clear them —
// same convention as UpdateTodoDto.
export class UpdateLifeGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsNumber()
  targetValue?: number | null;

  @IsOptional()
  @IsNumber()
  currentValue?: number | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @IsOptional()
  @IsEnum(LifeGoalStatus)
  status?: LifeGoalStatus;
}
