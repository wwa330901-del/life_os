import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { UsersService } from '../users/users.service';
import { AskAiAssistantDto } from './dto/ask-ai-assistant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

const NO_API_KEY_MESSAGE =
  '你還沒有設定自己的 Gemini API 金鑰，請先到 App 的「AI 設定」貼上你自己的金鑰才能使用這個功能。';

@UseGuards(JwtAuthGuard)
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(
    private readonly aiAssistant: AiAssistantService,
    private readonly usersService: UsersService,
  ) {}

  @Post('ask')
  async ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskAiAssistantDto) {
    const fullUser = await this.usersService.findById(user.id);
    if (!fullUser?.geminiApiKey) {
      throw new BadRequestException(NO_API_KEY_MESSAGE);
    }
    return this.aiAssistant.ask({
      userId: user.id,
      apiKey: fullUser.geminiApiKey,
      question: dto.question,
      previousInteractionId: dto.previousInteractionId,
      feature: 'ai_assistant_app',
    });
  }
}
