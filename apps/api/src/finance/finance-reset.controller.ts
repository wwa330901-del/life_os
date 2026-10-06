import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { FinanceResetService } from './finance-reset.service';
import { ResetFinanceDto } from './dto/reset-finance.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/reset')
export class FinanceResetController {
  constructor(private readonly service: FinanceResetService) {}

  @Post()
  reset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: ResetFinanceDto,
  ) {
    return this.service.reset(user.id, spaceId, dto);
  }
}
