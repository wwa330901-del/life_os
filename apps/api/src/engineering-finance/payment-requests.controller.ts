import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/payment-requests')
export class PaymentRequestsController {
  constructor(private readonly paymentRequestsService: PaymentRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.paymentRequestsService.list(user.id, projectId);
  }

  @Get(':paymentRequestId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('paymentRequestId') paymentRequestId: string,
  ) {
    return this.paymentRequestsService.getOne(user.id, projectId, paymentRequestId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePaymentRequestDto,
  ) {
    return this.paymentRequestsService.create(user.id, projectId, dto);
  }
}
