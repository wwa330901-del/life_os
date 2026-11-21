import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Allow } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { FinanceReconcileService } from './finance-reconcile.service';

class ReconcileDto {
  /** 帳戶現在實際有多少（信用卡欠錢用負數）。 */
  @Allow()
  actualBalance!: number;

  /** YYYY-MM-DD，不給＝今天。 */
  @Allow()
  date?: string;

  /** true＝只算不記（App 預覽）。 */
  @Allow()
  previewOnly?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance')
export class FinanceReconcileController {
  constructor(private readonly service: FinanceReconcileService) {}

  @Post('accounts/:accountId/reconcile')
  async reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('accountId') accountId: string,
    @Body() dto: ReconcileDto,
  ) {
    const actual = Number(dto.actualBalance);
    if (dto.previewOnly) {
      const { bookBalance, plan } = await this.service.preview(user.id, spaceId, accountId, actual);
      return { bookBalance, actualBalance: actual, plan };
    }
    const date = typeof dto.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dto.date) ? dto.date : undefined;
    return this.service.reconcile(user.id, spaceId, accountId, actual, date);
  }

  @Get('reconciliations')
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }
}
