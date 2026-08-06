import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FinanceReportService } from './finance-report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/report')
export class FinanceReportController {
  constructor(private readonly service: FinanceReportService) {}

  @Get()
  getReport(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.getReport(user.id, spaceId);
  }
}
