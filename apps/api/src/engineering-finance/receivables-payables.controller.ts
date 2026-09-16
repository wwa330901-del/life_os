import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ReceivablesPayablesService } from './receivables-payables.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/receivables-payables')
export class ReceivablesPayablesController {
  constructor(private readonly service: ReceivablesPayablesService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.service.get(user.id, spaceId);
  }
}
