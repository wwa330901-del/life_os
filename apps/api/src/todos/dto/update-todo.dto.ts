import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TodoPriority } from '../../../generated/prisma/client.js';

// Every field optional; nullable fields (dueDate/notes/assigneeUserId)
// accept an explicit `null` to clear them. A todo can't change between
// 個人/工作 after creation — not requested, not supported.
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
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;
}
