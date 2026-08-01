import { ArrayMinSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class SubmitDocumentApprovalDto {
  /// Ordered list of approver user ids — sequence 1..N follows array order.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  approverUserIds: string[];
}
