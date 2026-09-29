import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CalendarRecurrenceFrequency, CalendarSyncTarget } from '../../../generated/prisma/client.js';

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

  /// 要存到 Google 還是 iPhone（iCloud）——2026-09-30 起 App 一定要選。
  /// 伺服器端保持選填，讓還沒更新的舊版 App 仍然能新增（走舊行為）。
  @IsOptional()
  @IsEnum(CalendarSyncTarget)
  syncTarget?: CalendarSyncTarget;
}
