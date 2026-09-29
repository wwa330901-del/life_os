import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TodoPriority, CalendarSyncTarget } from '../../../generated/prisma/client.js';

// Exactly one of dueDate/isOngoing is required (validated in
// TodosService, not here — class-validator's per-field decorators can't
// express an either-or across two fields).
export class CreateTodoDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /// Whether `dueDate` carries a meaningful time-of-day, same concept as
  /// `CalendarEvent.allDay`. Defaults to true (no time) when omitted —
  /// matches every pre-existing todo's actual "date only" reality.
  @IsOptional()
  @IsBoolean()
  dueDateAllDay?: boolean;

  @IsOptional()
  @IsBoolean()
  isOngoing?: boolean;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsString()
  notes?: string;

  /// 有日期時自動產生的那筆行事曆要存到 Google 還是 iPhone（2026-09-30）。
  @IsOptional()
  @IsEnum(CalendarSyncTarget)
  calendarSyncTarget?: CalendarSyncTarget;
}
