import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateCalendarDto {
  /** Dart's DateTime.monday..sunday numbering (1..7) — see schema.prisma. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weeklyOffDays?: number[];

  @IsOptional()
  @IsBoolean()
  useTaiwanGovernmentCalendar?: boolean;

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  adHocHolidays?: string[];

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  adHocWorkdays?: string[];
}
