import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class FillDocumentDto {
  @IsObject()
  values: Record<string, string>;

  /// Display name for the resulting `GeneratedDocument` record — defaults
  /// to the template's own name when omitted.
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
