import { IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
