import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateVendorQuoteDto {
  @IsString()
  @MinLength(1)
  vendorName: string;

  @IsNumber()
  @Min(0)
  quotedAmount: number;

  @IsOptional()
  @IsString()
  note?: string;
}
