import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateFinanceAdvanceRepaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  accountId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  note?: string;
}
