import { IsIn, IsString, MinLength, ValidateIf } from 'class-validator';

export class ReviewMaterialSubmissionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  /** 駁回時必填、核准時選填——ValidateIf 為 false 時整條規則鏈完全跳過，
   * 同 DocumentApprovalStep.decisionComment 的必填/選填規則。 */
  @ValidateIf((dto: ReviewMaterialSubmissionDto) => dto.status === 'REJECTED')
  @IsString()
  @MinLength(1)
  reviewComment?: string;
}
