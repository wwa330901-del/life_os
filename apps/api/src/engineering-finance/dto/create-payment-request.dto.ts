import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreatePaymentRequestDto {
  @IsString()
  costControlRowId: string;

  @IsString()
  @MinLength(1)
  vendorName: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsDateString()
  requestDate: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsString()
  salesManagerUserId: string;

  @IsString()
  financeReviewUserId: string;

  @IsString()
  costControlApproverUserId: string;

  @IsString()
  generalManagerUserId: string;

  @IsString()
  accountingUserId: string;
}
