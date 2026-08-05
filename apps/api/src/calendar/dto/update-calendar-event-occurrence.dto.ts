import { IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CalendarRecurrenceFrequency } from '../../../generated/prisma/client.js';

export type CalendarOccurrenceEditScope = 'THIS' | 'FOLLOWING' | 'ALL';

// Google Calendar-style 只改這次／這次以後／全部 edit scope — see
// CalendarEventsService.updateOccurrence's doc comment for what each scope
// actually does to the series/exceptions. Every editable field is optional
// (same "only sent fields change" convention as UpdateCalendarEventDto);
// `occurrenceDate`/`scope` are the only two always required.
export class UpdateCalendarEventOccurrenceDto {
  @IsDateString()
  occurrenceDate: string;

  @IsIn(['THIS', 'FOLLOWING', 'ALL'])
  scope: CalendarOccurrenceEditScope;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  /// Only consulted for FOLLOWING/ALL (a THIS-scoped edit never changes the
  /// series' own recurrence pattern, only overrides one date).
  @IsOptional()
  @IsEnum(CalendarRecurrenceFrequency)
  recurrenceFrequency?: CalendarRecurrenceFrequency;

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string | null;
}
