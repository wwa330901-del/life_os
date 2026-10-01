import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { HealthRecordType } from '../../../generated/prisma/client.js';

export class HealthRecordDto {
  @IsEnum(HealthRecordType)
  type: HealthRecordType;

  /// YYYY-MM-DD；睡眠＝起床那天，不填＝今天（睡眠有 endAt 就用 endAt 那天）
  @IsOptional()
  @IsDateString()
  date?: string;

  /// 睡眠：幾點睡、幾點起（ISO 時間）
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  /// 體重（公斤）或步數
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  activity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
