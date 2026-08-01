import { IsString, MinLength } from 'class-validator';

export class AddApprovalStepNoteDto {
  @IsString()
  @MinLength(1)
  text: string;
}
