import { IsIn, IsString } from 'class-validator';

export class AddMemberDto {
  @IsString()
  username: string;

  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
