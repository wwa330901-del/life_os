import { IsObject } from 'class-validator';

export class FillDocumentDto {
  @IsObject()
  values: Record<string, string>;
}
