import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { StockTransactionType } from '../../../generated/prisma/client.js';

export class CreateStockTransactionDto {
  @IsString()
  stockCode: string;

  @IsEnum(StockTransactionType)
  type: StockTransactionType;

  /// Per-share fill price. `totalCost` is derived server-side as
  /// `shares * pricePerShare` — the caller never computes it.
  @IsNumber()
  @Min(0.01)
  pricePerShare: number;

  @IsNumber()
  @Min(0.01)
  shares: number;

  @IsDateString()
  tradeDate: string;

  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  note?: string;
}
