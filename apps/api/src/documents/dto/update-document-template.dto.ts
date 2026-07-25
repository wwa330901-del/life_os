import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDocumentTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  @IsOptional()
  @IsArray()
  fields?: unknown[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTypeOptionIds?: string[];
}
