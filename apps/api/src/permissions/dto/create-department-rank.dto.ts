import { IsString, MinLength } from 'class-validator';

export class CreateDepartmentRankDto {
  @IsString()
  @MinLength(1)
  name: string;
}
