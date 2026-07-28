import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceBudgetsService } from './finance-budgets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { UpsertFinanceBudgetDto } from './dto/upsert-finance-budget.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/budgets')
export class FinanceBudgetsController {
  constructor(private readonly service: FinanceBudgetsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Get('status')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Query('month') month: string,
  ) {
    return this.service.monthlyStatus(user.id, spaceId, month);
  }

  @Post()
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: UpsertFinanceBudgetDto,
  ) {
    return this.service.upsert(user.id, spaceId, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(user.id, spaceId, id);
  }
}
