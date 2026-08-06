import { IsBoolean, IsString } from 'class-validator';

export class ReorderCostControlRowDto {
  @IsString()
  targetId: string;

  @IsBoolean()
  insertAfter: boolean;
}
