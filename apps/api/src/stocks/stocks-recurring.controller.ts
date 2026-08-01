import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StocksRecurringService } from './stocks-recurring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateStockRecurringInvestmentDto } from './dto/create-stock-recurring-investment.dto';
import { UpdateStockRecurringInvestmentDto } from './dto/update-stock-recurring-investment.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/stocks/recurring')
export class StocksRecurringController {
  constructor(private readonly service: StocksRecurringService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateStockRecurringInvestmentDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStockRecurringInvestmentDto,
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
