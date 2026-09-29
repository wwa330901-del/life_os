import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { LifeGoalPeriod, LifeGoalStatus, LifeGoalTrackingType } from '../../../generated/prisma/client.js';

// Every field optional; nullable fields (notes/category/targetValue/
// currentValue/unit/targetDate/trackingAccountId/trackingKeyword) accept an
// explicit `null` to clear them — same convention as UpdateTodoDto.
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

  /** Starting point for progress (體重 75→70). Defaults to currentValue on create. */
  @IsOptional()
  @IsNumber()
  startValue?: number | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @IsOptional()
  @IsEnum(LifeGoalStatus)
  status?: LifeGoalStatus;

  @IsOptional()
  @IsEnum(LifeGoalTrackingType)
  trackingType?: LifeGoalTrackingType;

  @IsOptional()
  @IsString()
  trackingAccountId?: string | null;

  @IsOptional()
  @IsString()
  trackingKeyword?: string | null;

  @IsOptional()
  @IsEnum(LifeGoalPeriod)
  checkInPeriod?: LifeGoalPeriod;

  @IsOptional()
  @IsBoolean()
  requireCheckInNote?: boolean;
}
