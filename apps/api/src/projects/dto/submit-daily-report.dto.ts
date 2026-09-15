import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitDailyReportDto {
  /** 省略就是今天（Taipei 曆日）——見 DailyReportsService.submit。 */
  @IsOptional()
  @IsDateString()
  reportDate?: string;

  @IsString()
  @MinLength(1)
  workContent: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  manpower?: number;

  @IsOptional()
  @IsString()
  issues?: string;
}
