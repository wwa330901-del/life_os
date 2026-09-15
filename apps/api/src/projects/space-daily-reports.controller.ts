import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DailyReportsService } from './daily-reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

/** 空間層級彙總——「今日未交日報」清單，見 DailyReportsService.listMissingToday. */
@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/daily-reports')
export class SpaceDailyReportsController {
  constructor(private readonly dailyReportsService: DailyReportsService) {}

  @Get('missing-today')
  listMissingToday(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.dailyReportsService.listMissingToday(user.id, spaceId);
  }
}
