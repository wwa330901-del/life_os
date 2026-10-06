import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { StocksSettingsService } from './stocks-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { SetStockSettingsDto } from './dto/set-stock-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/stocks/settings')
export class StocksSettingsController {
  constructor(private readonly service: StocksSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.get(user.id, spaceId);
  }

  @Put()
  set(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string, @Body() dto: SetStockSettingsDto) {
    return this.service.setAccount(user.id, spaceId, dto.accountId ?? null);
  }
}
