import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateQuotationItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  costUnitPrice: number;
}
