import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FinanceRecurringTransactionsService } from './finance-recurring-transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateFinanceRecurringTransactionDto } from './dto/create-finance-recurring-transaction.dto';
import { UpdateFinanceRecurringTransactionDto } from './dto/update-finance-recurring-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/recurring-transactions')
export class FinanceRecurringTransactionsController {
  constructor(private readonly service: FinanceRecurringTransactionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateFinanceRecurringTransactionDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceRecurringTransactionDto,
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
