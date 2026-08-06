import { IsOptional, IsString } from 'class-validator';

export class ReanalyzeKnowledgeItemDto {
  @IsOptional()
  @IsString()
  instruction?: string;
}
