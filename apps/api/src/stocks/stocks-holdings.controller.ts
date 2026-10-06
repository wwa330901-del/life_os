import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { StocksHoldingsService } from './stocks-holdings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { SetStockOpeningDto } from './dto/set-stock-opening.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/stocks/holdings')
export class StocksHoldingsController {
  constructor(private readonly service: StocksHoldingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Get('openings')
  listOpenings(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.listOpenings(user.id, spaceId);
  }

  @Put('openings')
  setOpening(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string, @Body() dto: SetStockOpeningDto) {
    return this.service.setOpening(user.id, spaceId, dto);
  }

  @Delete('openings/:stockCode')
  removeOpening(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('stockCode') stockCode: string,
  ) {
    return this.service.removeOpening(user.id, spaceId, stockCode);
  }
}
