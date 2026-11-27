import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class SetKnowledgeReadDto {
  @IsBoolean()
  read!: boolean;
}

export class RenameKnowledgeTopicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;
}

export class MergeKnowledgeTopicDto {
  @IsString()
  targetTopicId!: string;
}
