import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyValueInputDto } from './property-value-input.dto';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsDateString()
  projectStartDate?: string;

  @IsOptional()
  @IsDateString()
  projectEndDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyValueInputDto)
  propertyValues?: PropertyValueInputDto[];
}
