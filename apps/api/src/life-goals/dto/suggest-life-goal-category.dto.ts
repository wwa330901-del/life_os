import { IsOptional, IsString, MinLength } from 'class-validator';

export class SuggestLifeGoalCategoryDto {
  @IsString()
  @MinLength(1)
  title: string;

  /** What the user typed as a custom category, if anything. */
  @IsOptional()
  @IsString()
  category?: string;
}
