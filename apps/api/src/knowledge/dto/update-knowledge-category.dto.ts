import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateKnowledgeCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** Full replacement list of userIds blocked from seeing this category
   * while it's public — sent as a complete list from the App each time,
   * not a single add/remove delta. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedUserIds?: string[];
}
