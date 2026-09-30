import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateJournalEntryDto {
  @IsString()
  @MinLength(1)
  content: string;

  /// YYYY-MM-DD，不填＝今天（台北）
  @IsOptional()
  @IsDateString()
  date?: string;

  /// 1＝很差 … 5＝很好
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  mood?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];
}
