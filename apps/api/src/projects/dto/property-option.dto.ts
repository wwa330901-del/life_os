import { IsString, MinLength } from 'class-validator';

export class PropertyOptionDto {
  @IsString()
  @MinLength(1)
  label: string;
}
