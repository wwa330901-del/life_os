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

// Every field is optional and, where the underlying column is nullable,
// accepts an explicit `null` to clear it (class-validator's @IsOptional
// skips further checks on both `undefined` and `null`, and the service
// distinguishes "not sent" from "sent as null" via `!== undefined`).
export class UpdateWorkItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  predecessorIds?: string[];

  @IsOptional()
  @IsString()
  tradeCategory?: string | null;

  @IsOptional()
  @IsInt()
  colorValue?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  progressPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  manualStartDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isManuallyPinned?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string | null;
}
