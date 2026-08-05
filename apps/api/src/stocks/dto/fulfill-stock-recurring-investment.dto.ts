import { IsNumber, Min } from 'class-validator';

export class FulfillStockRecurringInvestmentDto {
  @IsNumber()
  @Min(0.01)
  pricePerShare: number;

  @IsNumber()
  @Min(0.01)
  totalCost: number;
}
