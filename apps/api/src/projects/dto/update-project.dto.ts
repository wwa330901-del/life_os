import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProjectCaseType } from '../../../generated/prisma/client.js';
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
  @IsEnum(ProjectCaseType)
  caseType?: ProjectCaseType;

  @IsOptional()
  @IsBoolean()
  skipDesignPhase?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyValueInputDto)
  propertyValues?: PropertyValueInputDto[];
}
