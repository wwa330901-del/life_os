import { IsIn, IsOptional, IsString } from 'class-validator';

export class DecidePaymentRequestStageDto {
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  /** REJECT 時必填（由 service 檢查），APPROVE 選填。 */
  @IsOptional()
  @IsString()
  comment?: string;
}
