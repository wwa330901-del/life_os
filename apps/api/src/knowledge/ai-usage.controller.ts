import { Controller, Get, UseGuards } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('knowledge/ai-usage')
export class AiUsageController {
  constructor(private readonly aiUsageService: AiUsageService) {}

  @Get()
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.aiUsageService.history(user.id);
  }
}
