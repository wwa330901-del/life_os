import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  PermissionAction,
  PermissionResourceType,
} from '../../../generated/prisma/client.js';

/// departmentId/rankId omitted (undefined) means「不限」for that dimension —
/// there's no way to pass an explicit null here (unlike
/// AssignMemberDepartmentDto) because a rule always either scopes a
/// dimension or leaves it wildcard; there's no third "clear" state to
/// distinguish from creation.
export class CreatePermissionRuleDto {
  @IsEnum(PermissionResourceType)
  resourceType: PermissionResourceType;

  @IsEnum(PermissionAction)
  action: PermissionAction;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  rankId?: string;

  /// 只在 action=WRITE 時有意義——見 PermissionRule.readOnlyFields 的說明。
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  readOnlyFields?: string[];
}
