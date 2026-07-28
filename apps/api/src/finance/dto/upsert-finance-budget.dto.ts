import { IsNumber, IsString, Min } from 'class-validator';

export class UpsertFinanceBudgetDto {
  @IsString()
  categoryId: string;

  @IsNumber()
  @Min(0)
  monthlyAmount: number;
}
