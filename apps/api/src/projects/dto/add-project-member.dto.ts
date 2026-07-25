import { IsIn, IsString } from 'class-validator';

export class AddProjectMemberDto {
  @IsString()
  userId: string;

  @IsIn(['PM', 'MEMBER'])
  role: 'PM' | 'MEMBER';
}
