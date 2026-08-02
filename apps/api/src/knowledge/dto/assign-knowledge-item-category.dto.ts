import { IsString, MinLength } from 'class-validator';

export class AssignKnowledgeItemCategoryDto {
  @IsString()
  @MinLength(1)
  categoryId: string;
}
