import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceTransactionsService } from './finance-transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto';
import { UpdateFinanceTransactionDto } from './dto/update-finance-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/transactions')
export class FinanceTransactionsController {
  constructor(private readonly service: FinanceTransactionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Query('month') month?: string,
  ) {
    return this.service.list(user.id, spaceId, month);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Query('month') month: string,
  ) {
    return this.service.monthlySummary(user.id, spaceId, month);
  }

  @Get('trend')
  trend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Query('months') months?: string,
  ) {
    return this.service.trend(user.id, spaceId, months ? Number(months) : 6);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateFinanceTransactionDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceTransactionDto,
  ) {
    return this.service.update(user.id, spaceId, id, dto);
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
