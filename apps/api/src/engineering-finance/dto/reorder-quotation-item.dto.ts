import { IsBoolean, IsString } from 'class-validator';

export class ReorderQuotationItemDto {
  @IsString()
  targetId: string;

  @IsBoolean()
  insertAfter: boolean;
}
