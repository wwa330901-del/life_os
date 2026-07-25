import { IsString, MinLength } from 'class-validator';

export class ProjectOptionDto {
  @IsString()
  @MinLength(1)
  label: string;
}
