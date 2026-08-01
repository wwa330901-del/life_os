import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { StocksTransactionsService } from './stocks-transactions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/stocks/transactions')
export class StocksTransactionsController {
  constructor(private readonly service: StocksTransactionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateStockTransactionDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
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
