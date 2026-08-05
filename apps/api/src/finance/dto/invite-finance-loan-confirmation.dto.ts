import { IsEmail } from 'class-validator';

export class InviteFinanceLoanConfirmationDto {
  @IsEmail()
  email: string;
}
