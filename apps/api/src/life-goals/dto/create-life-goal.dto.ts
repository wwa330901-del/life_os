import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { LifeGoalPeriod, LifeGoalTrackingType } from '../../../generated/prisma/client.js';

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

  /** Starting point for progress (體重 75→70). Defaults to currentValue on create. */
  @IsOptional()
  @IsNumber()
  startValue?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsEnum(LifeGoalTrackingType)
  trackingType?: LifeGoalTrackingType;

  @IsOptional()
  @IsString()
  trackingAccountId?: string;

  @IsOptional()
  @IsString()
  trackingKeyword?: string;

  @IsOptional()
  @IsEnum(LifeGoalPeriod)
  checkInPeriod?: LifeGoalPeriod;

  @IsOptional()
  @IsBoolean()
  requireCheckInNote?: boolean;
}
