import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TodoPriority } from '../../../generated/prisma/client.js';

// projectId omitted → 個人事項 (owned by the caller); projectId set → 工作
// 事項 (belongs to that project, caller must have access to it).
//
// Exactly one of dueDate/isOngoing is required (validated in
// TodosService, not here — class-validator's per-field decorators can't
// express an either-or across two fields).
export class CreateTodoDto {
  @IsOptional()
  @IsString()
  projectId?: string;

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

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}
