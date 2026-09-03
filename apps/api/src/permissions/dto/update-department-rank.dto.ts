import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDepartmentRankDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
