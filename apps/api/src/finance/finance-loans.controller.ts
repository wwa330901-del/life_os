import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FinanceLoansService } from './finance-loans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateFinanceLoanDto } from './dto/create-finance-loan.dto';
import { CreateFinanceLoanRepaymentDto } from './dto/create-finance-loan-repayment.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/finance/loans')
export class FinanceLoansController {
  constructor(private readonly service: FinanceLoansService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.service.list(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateFinanceLoanDto,
  ) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Post(':id/repayments')
  addRepayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: CreateFinanceLoanRepaymentDto,
  ) {
    return this.service.addRepayment(user.id, spaceId, id, dto);
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
