import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TodoPriority } from '../../../generated/prisma/client.js';

export class CreateProjectTodoDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

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
