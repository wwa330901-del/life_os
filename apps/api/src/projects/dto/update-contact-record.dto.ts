import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ContactRecordType } from '../../../generated/prisma/client.js';

export class UpdateContactRecordDto {
  @IsOptional()
  @IsEnum(ContactRecordType)
  type?: ContactRecordType;

  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsString()
  attendees?: string;
}
