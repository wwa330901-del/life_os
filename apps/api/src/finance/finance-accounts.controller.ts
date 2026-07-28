import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateFinanceAccountDto } from './dto/create-finance-account.dto';
import { UpdateFinanceAccountDto } from './dto/update-finance-account.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/accounts')
export class FinanceAccountsController {
  constructor(private readonly service: FinanceAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateFinanceAccountDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceAccountDto,
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
