import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateVendorQuoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vendorId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quotedAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  negotiatedAmount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
