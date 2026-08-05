import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CalendarRecurrenceFrequency } from '../../../generated/prisma/client.js';

export class CreateCalendarEventDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsDateString()
  startAt: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /// 行事曆循環事件 — omitted/NONE means a plain one-off event (unchanged
  /// default behavior).
  @IsOptional()
  @IsEnum(CalendarRecurrenceFrequency)
  recurrenceFrequency?: CalendarRecurrenceFrequency;

  /// Only meaningful alongside a non-NONE `recurrenceFrequency` — omitted
  /// means "repeats forever".
  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;
}
