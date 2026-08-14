import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ProcurementInspectionMethod,
  ProcurementPaymentMethod,
} from '../../../generated/prisma/client.js';

export class UpdateProcurementComparisonDto {
  @IsOptional()
  @IsEnum(ProcurementInspectionMethod)
  inspectionMethod?: ProcurementInspectionMethod;

  @ValidateIf(
    (o: UpdateProcurementComparisonDto) =>
      o.inspectionMethod === ProcurementInspectionMethod.OTHER,
  )
  @IsString()
  @MinLength(1)
  inspectionOtherNote?: string;

  @IsOptional()
  @IsEnum(ProcurementPaymentMethod)
  paymentMethod?: ProcurementPaymentMethod;

  @ValidateIf(
    (o: UpdateProcurementComparisonDto) =>
      o.paymentMethod === ProcurementPaymentMethod.OTHER,
  )
  @IsString()
  @MinLength(1)
  paymentOtherNote?: string;
}
