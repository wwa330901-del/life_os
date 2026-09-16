import { IsDateString, IsOptional, IsString } from 'class-validator';

/** multipart 表單一起送——photoDate/caption 欄位 + file 欄位（照片本體）。 */
export class UploadExecutionPhotoDto {
  @IsDateString()
  photoDate: string;

  @IsOptional()
  @IsString()
  caption?: string;
}
