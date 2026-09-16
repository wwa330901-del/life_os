import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitWeeklyReportDto {
  /** 省略就是本週（Taipei 曆日的本週週一）——不管傳的是週間哪一天，
   * WeeklyReportsService.submit 都會正規化成當週週一。 */
  @IsOptional()
  @IsDateString()
  weekStartDate?: string;

  @IsString()
  @MinLength(1)
  summary: string;

  @IsOptional()
  @IsString()
  nextWeekPlan?: string;

  @IsOptional()
  @IsString()
  issues?: string;
}
