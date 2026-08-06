import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCostControlAdjustmentDto {
  @IsIn(['ADD', 'DEDUCT'])
  type: 'ADD' | 'DEDUCT';

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}
