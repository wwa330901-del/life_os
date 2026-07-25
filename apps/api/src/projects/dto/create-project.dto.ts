import { IsArray, IsDateString, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyValueInputDto } from './property-value-input.dto';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name: string;

  /** Date-only string (YYYY-MM-DD) — see the schedule service for why. */
  @IsDateString()
  projectStartDate: string;

  /** Values for whatever properties the space has defined — empty/absent for a space with none yet. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyValueInputDto)
  propertyValues?: PropertyValueInputDto[];
}
