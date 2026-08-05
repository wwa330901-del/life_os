import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStockTransactionDto {
  @IsOptional()
  @IsString()
  stockCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerShare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  totalCost?: number;

  @IsOptional()
  @IsDateString()
  tradeDate?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
