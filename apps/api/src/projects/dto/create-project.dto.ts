import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  siteAddress?: string;

  /** Date-only string (YYYY-MM-DD) — see the schedule service for why. */
  @IsDateString()
  projectStartDate: string;
}
