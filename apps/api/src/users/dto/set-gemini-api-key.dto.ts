import { IsString, MinLength } from 'class-validator';

export class SetGeminiApiKeyDto {
  @IsString()
  @MinLength(10)
  apiKey: string;
}
