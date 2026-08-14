import { IsEnum, IsString, MinLength, ValidateIf } from 'class-validator';
import {
  ProcurementInspectionMethod,
  ProcurementPaymentMethod,
} from '../../../generated/prisma/client.js';

export class CreateProcurementComparisonDto {
  /** 只能是報價單的「大項」（頂層工項），service 層會檢查層級。 */
  @IsString()
  @MinLength(1)
  quotationLineItemId: string;

  @IsEnum(ProcurementInspectionMethod)
  inspectionMethod: ProcurementInspectionMethod;

  @ValidateIf(
    (o: CreateProcurementComparisonDto) =>
      o.inspectionMethod === ProcurementInspectionMethod.OTHER,
  )
  @IsString()
  @MinLength(1)
  inspectionOtherNote?: string;

  @IsEnum(ProcurementPaymentMethod)
  paymentMethod: ProcurementPaymentMethod;

  @ValidateIf(
    (o: CreateProcurementComparisonDto) =>
      o.paymentMethod === ProcurementPaymentMethod.OTHER,
  )
  @IsString()
  @MinLength(1)
  paymentOtherNote?: string;
}
