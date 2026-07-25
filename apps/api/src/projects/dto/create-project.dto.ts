import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  clientName: string;

  @IsString()
  @MinLength(1)
  siteAddress: string;

  @IsOptional()
  @IsString()
  caseNumber?: string;

  @IsString()
  typeId: string;

  @IsString()
  statusId: string;

  /** Date-only string (YYYY-MM-DD) — see the schedule service for why. */
  @IsDateString()
  projectStartDate: string;
}
