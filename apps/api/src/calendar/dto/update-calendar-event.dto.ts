import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

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
}
