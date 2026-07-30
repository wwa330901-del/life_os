import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateFinanceCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /// Re-parent this category. `null` explicitly makes it a 母分類 (only
  /// valid if it currently has no children of its own — see service).
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
