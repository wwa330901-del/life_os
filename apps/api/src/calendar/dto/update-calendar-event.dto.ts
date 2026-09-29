import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CalendarRecurrenceFrequency, CalendarSyncTarget } from '../../../generated/prisma/client.js';

// Every field optional; nullable fields (endAt/location/notes) accept an
// explicit `null` to clear them — same "not sent vs. sent as null"
// convention as UpdateProjectTodoDto.
export class UpdateCalendarEventDto {
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

  @IsOptional()
  @IsEnum(CalendarRecurrenceFrequency)
  recurrenceFrequency?: CalendarRecurrenceFrequency;

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string | null;

  /// 要存到 Google 還是 iPhone（iCloud）——2026-09-30 起 App 一定要選。
  /// 伺服器端保持選填，讓還沒更新的舊版 App 仍然能新增（走舊行為）。
  @IsOptional()
  @IsEnum(CalendarSyncTarget)
  syncTarget?: CalendarSyncTarget;
}
