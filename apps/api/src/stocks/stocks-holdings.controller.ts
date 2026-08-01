import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { StocksHoldingsService } from './stocks-holdings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/stocks/holdings')
export class StocksHoldingsController {
  constructor(private readonly service: StocksHoldingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }
}
