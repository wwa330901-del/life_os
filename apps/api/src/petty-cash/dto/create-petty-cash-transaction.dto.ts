import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  Min,
} from 'class-validator';
import { PettyCashType } from '../../../generated/prisma/client.js';

export class CreatePettyCashTransactionDto {
  @IsDateString()
  transactionDate: string;

  @IsEnum(PettyCashType)
  type: PettyCashType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(1)
  purpose: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
