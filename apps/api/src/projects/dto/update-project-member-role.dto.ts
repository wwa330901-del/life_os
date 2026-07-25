import { IsIn } from 'class-validator';

export class UpdateProjectMemberRoleDto {
  @IsIn(['PM', 'MEMBER'])
  role: 'PM' | 'MEMBER';
}
