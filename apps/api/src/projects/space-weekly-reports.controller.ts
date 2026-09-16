import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WeeklyReportsService } from './weekly-reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

/** 空間層級彙總——「本週未交週報」清單，見 WeeklyReportsService.listMissingThisWeek. */
@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/weekly-reports')
export class SpaceWeeklyReportsController {
  constructor(private readonly weeklyReportsService: WeeklyReportsService) {}

  @Get('missing-this-week')
  listMissingThisWeek(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.weeklyReportsService.listMissingThisWeek(user.id, spaceId);
  }
}
