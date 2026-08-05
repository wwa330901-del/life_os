import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateFinanceAdvanceRepaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
