import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateJournalEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

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
