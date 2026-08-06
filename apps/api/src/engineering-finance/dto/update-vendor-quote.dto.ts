import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateVendorQuoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  vendorName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quotedAmount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
