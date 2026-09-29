import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateLifeGoalCheckInDto {
  /** Defaults to today (Taipei) when omitted. */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Defaults to 1 — 「打卡一次」. Set for check-ins that carry an amount (跑了 5 公里). */
  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
