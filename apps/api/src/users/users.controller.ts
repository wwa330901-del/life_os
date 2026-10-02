import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { SetGeminiApiKeyDto } from './dto/set-gemini-api-key.dto';
import Anthropic from '@anthropic-ai/sdk';
import { claudeClient } from '../ai/claude';

/** Minimal cross-account lookup — currently only used by the 知識庫 category
 * blacklist UI ("封鎖某人看到我的公開分類"), which needs to resolve an email
 * to a userId. Returns only non-sensitive display fields. */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('lookup')
  async lookupByEmail(@Query('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('找不到這個 email 對應的帳號');
    return { id: user.id, name: user.name, email: user.email };
  }

  /** Never returns the key itself once set — only whether one exists, so
   * the App can show "已設定"/"未設定" without ever displaying the value
   * back (the user already has their own copy of it). */
  @Get('me/gemini-key')
  async hasGeminiApiKey(@CurrentUser() user: AuthenticatedUser) {
    return { hasKey: await this.usersService.hasGeminiApiKey(user.id) };
  }

  @Patch('me/gemini-key')
  async setGeminiApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetGeminiApiKeyDto,
  ) {
    await this.usersService.setGeminiApiKey(user.id, dto.apiKey);
    return { hasKey: true };
  }

  @Delete('me/gemini-key')
  async clearGeminiApiKey(@CurrentUser() user: AuthenticatedUser) {
    await this.usersService.setGeminiApiKey(user.id, null);
    return { hasKey: false };
  }

  /** Claude 金鑰（2026-10-02 起 AI 主要用 Claude）。存之前先用列模型（不花錢）確認金鑰有效。 */
  @Get('me/claude-key')
  async hasClaudeApiKey(@CurrentUser() user: AuthenticatedUser) {
    return { hasKey: await this.usersService.hasClaudeApiKey(user.id) };
  }

  @Patch('me/claude-key')
  async setClaudeApiKey(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetGeminiApiKeyDto) {
    const apiKey = dto.apiKey.trim();
    try {
      await claudeClient(apiKey).models.list({ limit: 1 });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new BadRequestException('這個 Claude 金鑰無效，請到 console.anthropic.com 的「API Keys」重新複製（sk-ant- 開頭）');
      }
      // 網路或 Anthropic 暫時有問題就先存，用的時候再說。
    }
    await this.usersService.setClaudeApiKey(user.id, apiKey);
    return { hasKey: true };
  }

  @Delete('me/claude-key')
  async clearClaudeApiKey(@CurrentUser() user: AuthenticatedUser) {
    await this.usersService.setClaudeApiKey(user.id, null);
    return { hasKey: false };
  }
}
