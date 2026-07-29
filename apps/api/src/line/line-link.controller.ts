import { Controller, Post, UseGuards } from '@nestjs/common';
import { LineService } from './line.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('line/link-code')
export class LineLinkController {
  constructor(private readonly lineService: LineService) {}

  /** Generates (or replaces) a short-lived code the user sends as a LINE
   * message to the 記帳 bot to link their LINE account to this one. */
  @Post()
  generate(@CurrentUser() user: AuthenticatedUser) {
    return this.lineService.generateLinkCode(user.id);
  }
}
