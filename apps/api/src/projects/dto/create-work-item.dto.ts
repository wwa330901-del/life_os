import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  /**
   * The Dart source enforces this with an `assert` that release builds
   * strip — this DTO is the real enforcement now that there's a network
   * boundary the single-user local app never had.
   */
  @IsInt()
  @Min(1)
  durationDays: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  predecessorIds?: string[];

  @IsOptional()
  @IsString()
  tradeCategory?: string;

  @IsOptional()
  @IsInt()
  colorValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  progressPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  manualStartDate?: string;

  @IsOptional()
  @IsBoolean()
  isManuallyPinned?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string;
}
