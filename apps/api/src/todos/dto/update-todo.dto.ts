import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TodoPriority, CalendarSyncTarget } from '../../../generated/prisma/client.js';

// Every field optional; nullable fields (dueDate/notes) accept an explicit
// `null` to clear them.
export class UpdateTodoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

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
  notes?: string | null;

  /// 有日期時自動產生的那筆行事曆要存到 Google 還是 iPhone（2026-09-30）。
  @IsOptional()
  @IsEnum(CalendarSyncTarget)
  calendarSyncTarget?: CalendarSyncTarget;
}
