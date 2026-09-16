import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ContactRecordType } from '../../../generated/prisma/client.js';

export class CreateContactRecordDto {
  @IsEnum(ContactRecordType)
  type: ContactRecordType;

  @IsDateString()
  recordDate: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString()
  attendees?: string;
}
