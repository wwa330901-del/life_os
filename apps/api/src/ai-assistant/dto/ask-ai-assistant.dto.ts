import { IsOptional, IsString, MinLength } from 'class-validator';

export class AskAiAssistantDto {
  @IsString()
  @MinLength(1)
  question: string;

  /** The previous `interactionId` this same chat session got back, if
   * continuing a conversation — omit for a brand-new conversation. Purely
   * client-held; this server never persists it. */
  @IsOptional()
  @IsString()
  previousInteractionId?: string;
}
