import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SelectVendorQuoteDto {
  @IsString()
  vendorQuoteId: string;

  /** 決標金額，議價後金額跟原始報價不同時填；不給就沿用該廠商的原始報價。 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  finalAwardedAmount?: number;
}
