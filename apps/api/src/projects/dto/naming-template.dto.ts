import { IsArray, IsString } from 'class-validator';

/// [propertyNames] in the order they should be joined by [separator] to
/// suggest a new project's 案名 — see ProjectPropertiesService.getNamingTemplate.
export class UpdateNamingTemplateDto {
  @IsArray()
  @IsString({ each: true })
  propertyNames: string[];

  @IsString()
  separator: string;
}
