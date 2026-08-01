import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { StockTransactionType } from '../../../generated/prisma/client.js';

export class CreateStockTransactionDto {
  @IsString()
  stockCode: string;

  @IsEnum(StockTransactionType)
  type: StockTransactionType;

  /// Per-share fill price. `shares` is derived server-side as
  /// `totalCost / pricePerShare` — the caller never computes it.
  @IsNumber()
  @Min(0.01)
  pricePerShare: number;

  @IsNumber()
  @Min(0.01)
  totalCost: number;

  @IsDateString()
  tradeDate: string;

  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  note?: string;
}
