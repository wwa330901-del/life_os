import { IsArray, IsString } from 'class-validator';

/** 送簽 dto，給①初始管制表／採發比價表／請款單期數共用——approverUserIds
 * 依序對應該表固定的關卡職稱（見 DocumentApprovalsService 的
 * FIXED_ROLE_CHAINS），數量沒對上會在 service 層被拒絕。 */
export class SubmitFixedRoleApprovalDto {
  @IsArray()
  @IsString({ each: true })
  approverUserIds: string[];
}
