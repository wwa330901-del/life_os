import { IsEmail } from 'class-validator';

export class InviteCalendarShareDto {
  @IsEmail()
  email: string;
}
