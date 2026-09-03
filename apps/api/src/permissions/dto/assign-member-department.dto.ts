import { IsOptional, IsString } from 'class-validator';

/// Both fields nullable on purpose — passing `null` explicitly clears the
/// assignment (member goes back to 無部門/無職級), distinct from omitting
/// the field (which leaves the existing value untouched).
export class AssignMemberDepartmentDto {
  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  rankId?: string | null;
}
