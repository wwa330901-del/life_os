import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DailyReportsService } from './daily-reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { SubmitDailyReportDto } from './dto/submit-daily-report.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/daily-reports')
export class DailyReportsController {
  constructor(private readonly dailyReportsService: DailyReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.dailyReportsService.list(user.id, projectId);
  }

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SubmitDailyReportDto,
  ) {
    return this.dailyReportsService.submit(user.id, projectId, dto);
  }

  @Delete(':reportId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('reportId') reportId: string,
  ) {
    return this.dailyReportsService.remove(user.id, projectId, reportId);
  }
}
