import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FinanceCategoryKind } from '../../../generated/prisma/client.js';

export class CreateFinanceCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEnum(FinanceCategoryKind)
  kind: FinanceCategoryKind;

  /// Omit for a 母分類. Set to an existing (parent-less) category's id to
  /// create a 子分類 under it — see FinanceCategoriesService for the
  /// two-level-only enforcement.
  @IsOptional()
  @IsString()
  parentId?: string;
}
