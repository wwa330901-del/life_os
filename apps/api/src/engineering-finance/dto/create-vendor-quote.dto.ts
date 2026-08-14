import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVendorQuoteDto {
  @IsString()
  @MinLength(1)
  vendorId: string;

  /** 報價(未稅) */
  @IsNumber()
  @Min(0)
  quotedAmount: number;

  /** 議價(未稅)，還沒議價前可以不填。 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  negotiatedAmount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
