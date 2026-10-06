import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FinanceReportService } from './finance-report.service';
import { FinanceHealthService } from './finance-health.service';
import { FinanceAccessService } from './finance-access.service';
import { FinancePlanService } from './finance-plan.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { FinancePlanAnswersDto } from './dto/finance-plan-answers.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/report')
export class FinanceReportController {
  constructor(
    private readonly service: FinanceReportService,
    private readonly health: FinanceHealthService,
    private readonly access: FinanceAccessService,
    private readonly plan: FinancePlanService,
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

  /** 理財評估：AI 依固定薪資與實際花費給分配建議（用使用者自己的 Gemini 金鑰）。 */
  @Post('plan')
  async generatePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() answers: FinancePlanAnswersDto,
  ) {
    await this.access.assertPersonalSpace(user.id, spaceId);
    // 舊版 App 不帶 body：DTO 欄位全是 undefined，就照上次存的。
    const hasAnswers = Object.values(answers ?? {}).some((v) => v !== undefined);
    return this.plan.generate(user.id, hasAnswers ? answers : undefined);
  }

  /** 規劃前的問卷：上次填的＋從記帳抓的建議值。 */
  @Get('plan/profile')
  async planProfile(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertPersonalSpace(user.id, spaceId);
    return this.plan.profileForm(user.id);
  }

  /** 最近一次的財務規劃（App「規劃」分頁一打開就顯示）。 */
  @Get('plan')
  async latestPlan(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertPersonalSpace(user.id, spaceId);
    return { plan: await this.plan.latest(user.id) };
  }

  /** 一鍵套用最近一次規劃的建議預算。 */
  @Post('plan/apply-budgets')
  async applyPlanBudgets(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertPersonalSpace(user.id, spaceId);
    return { applied: await this.plan.applyLatestBudgets(user.id) };
  }
}
