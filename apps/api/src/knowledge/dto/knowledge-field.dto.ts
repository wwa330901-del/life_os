import { IsIn, IsString, MinLength } from 'class-validator';

export class KnowledgeFieldDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN'])
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';
}

export class UpdateKnowledgeFieldDto {
  @IsString()
  @MinLength(1)
  name: string;
}
