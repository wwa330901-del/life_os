import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePaymentRequestPeriodDto {
  @IsString()
  @MinLength(1)
  costControlRowId: string;

  /** 使用者自訂期別名稱，例如「第一期」「保留款」——不是固定清單。 */
  @IsString()
  @MinLength(1)
  periodLabel: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsDateString()
  requestDate: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** 付款排程自動化用——選填，未設定不受 PaymentDueReminderService 影響。 */
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
