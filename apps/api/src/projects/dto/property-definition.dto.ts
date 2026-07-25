import { IsIn, IsString, MinLength } from 'class-validator';

export class CreatePropertyDefinitionDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(['TEXT', 'NUMBER', 'DATE', 'SELECT'])
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
}

export class RenamePropertyDefinitionDto {
  @IsString()
  @MinLength(1)
  name: string;
}
