import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { FinanceReportService } from './finance-report.service';
import { FinanceHealthService } from './finance-health.service';
import { FinanceAccessService } from './finance-access.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/report')
export class FinanceReportController {
  constructor(
    private readonly service: FinanceReportService,
    private readonly health: FinanceHealthService,
    private readonly access: FinanceAccessService,
  ) {}

  @Get()
  getReport(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.getReport(user.id, spaceId);
  }

  /** 財務健檢 0～100 分＋每一項的現況與建議。 */
  @Get('health')
  async getHealth(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertPersonalSpace(user.id, spaceId);
    return this.health.forSpace(user.id, spaceId);
  }
}
