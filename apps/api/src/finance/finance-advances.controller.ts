import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceAdvancesService } from './finance-advances.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateFinanceAdvanceDto } from './dto/create-finance-advance.dto';
import { CreateFinanceAdvanceRepaymentDto } from './dto/create-finance-advance-repayment.dto';
import { UpdateFinanceAdvanceDto } from './dto/update-finance-advance.dto';
import { UpdateFinanceAdvanceRepaymentDto } from './dto/update-finance-advance-repayment.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/advances')
export class FinanceAdvancesController {
  constructor(private readonly service: FinanceAdvancesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Query('projectId') projectId?: string,
    @Query('cursor') cursor?: string,
    @Query('settled') settled?: string,
  ) {
    return this.service.list(user.id, spaceId, {
      projectId,
      cursor,
      settled: settled === undefined ? undefined : settled === 'true',
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateFinanceAdvanceDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Post(':id/repayments')
  addRepayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: CreateFinanceAdvanceRepaymentDto,
  ) {
    return this.service.addRepayment(user.id, spaceId, id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceAdvanceDto,
  ) {
    return this.service.update(user.id, spaceId, id, dto);
  }

  @Patch(':id/repayments/:repaymentId')
  updateRepayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Param('repaymentId') repaymentId: string,
    @Body() dto: UpdateFinanceAdvanceRepaymentDto,
  ) {
    return this.service.updateRepayment(user.id, spaceId, id, repaymentId, dto);
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
