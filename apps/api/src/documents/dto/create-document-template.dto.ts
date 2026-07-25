import { IsString, MinLength } from 'class-validator';

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
}
