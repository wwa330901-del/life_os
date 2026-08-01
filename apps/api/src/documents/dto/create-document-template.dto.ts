import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Multipart upload — `code`/`name`/`category` are plain form fields, `file`
 * is the tagged `.docx` (handled separately via `FileInterceptor`), and
 * `fields`/`allowedTypeOptionIds` arrive as JSON-encoded strings (multipart
 * form fields can't carry structured JSON directly) parsed by the service.
 */
export class CreateDocumentTemplateDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  category: string;

  @IsString()
  fields: string;

  @IsString()
  allowedTypeOptionIds: string;

  /// Multipart form field, so a plain "true"/"false" string — parsed in the
  /// service. Omitted or anything other than "true" defaults to not
  /// requiring approval.
  @IsOptional()
  @IsString()
  requiresApproval?: string;
}
