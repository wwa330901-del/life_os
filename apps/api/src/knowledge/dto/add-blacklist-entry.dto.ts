import { IsEmail } from 'class-validator';

export class AddBlacklistEntryDto {
  @IsEmail()
  email: string;
}
