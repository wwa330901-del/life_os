import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMaterialSubmissionDto {
  @IsString()
  @MinLength(1)
  materialName: string;

  @IsOptional()
  @IsString()
  spec?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsDateString()
  submittedDate: string;
}
