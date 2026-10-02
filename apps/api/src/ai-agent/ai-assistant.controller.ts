import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { aiUnavailableMessage, AiUnavailableError } from '../ai/ai-errors';
import { needClaudeKey } from '../ai/claude';
import { UsersService } from '../users/users.service';
import { AskAiAssistantDto } from '../ai-assistant/dto/ask-ai-assistant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

const NO_API_KEY_MESSAGE = needClaudeKey('AI 問答');
const NOT_UNDERSTOOD = '我不太確定你的意思，可以換個說法再說一次嗎？';

@UseGuards(JwtAuthGuard)
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(
    private readonly agent: AiAgentService,
    private readonly usersService: UsersService,
  ) {}

  /** App 的 AI 問答（2026-10-01 起跟 LINE 同一個萬用 AI，能查也能記帳、排行程、打卡）。 */
  @Post('ask')
  async ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskAiAssistantDto) {
    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser?.claudeApiKey) {
      throw new BadRequestException(NO_API_KEY_MESSAGE);
    }
    let result;
    try {
      result = await this.agent.handleApp({
        userId: user.id,
        apiKey: fullUser.claudeApiKey,
        text: dto.question,
        previousInteractionId: dto.previousInteractionId,
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) return { answer: aiUnavailableMessage(error), interactionId: dto.previousInteractionId };
      throw error;
    }
    return { answer: result.handled ? result.reply : NOT_UNDERSTOOD, interactionId: result.interactionId };
  }
}
