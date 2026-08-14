import { IsBoolean, IsString } from 'class-validator';

export class ReorderSurchargeItemDto {
  @IsString()
  targetId: string;

  @IsBoolean()
  insertAfter: boolean;
}
