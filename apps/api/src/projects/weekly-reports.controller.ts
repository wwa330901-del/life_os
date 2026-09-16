import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WeeklyReportsService } from './weekly-reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { SubmitWeeklyReportDto } from './dto/submit-weekly-report.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/weekly-reports')
export class WeeklyReportsController {
  constructor(private readonly weeklyReportsService: WeeklyReportsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.weeklyReportsService.list(user.id, projectId);
  }

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SubmitWeeklyReportDto,
  ) {
    return this.weeklyReportsService.submit(user.id, projectId, dto);
  }

  @Delete(':reportId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('reportId') reportId: string,
  ) {
    return this.weeklyReportsService.remove(user.id, projectId, reportId);
  }
}
