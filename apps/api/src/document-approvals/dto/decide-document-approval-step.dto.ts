import { IsOptional, IsString } from 'class-validator';

/// Used for both approve (comment optional) and reject (comment required —
/// enforced in the service, not here, since the same DTO shape serves both).
export class DecideDocumentApprovalStepDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
