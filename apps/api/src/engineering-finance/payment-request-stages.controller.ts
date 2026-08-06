import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import type { PaymentRequestStage } from './payment-requests.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { DecidePaymentRequestStageDto } from './dto/decide-payment-request-stage.dto';

/// Cross-project 簽核佇列（「待我簽核」）+ 逐關決定——跟 DocumentApproval
/// 的 document-approval-steps.controller.ts 同樣理由：權限靠這一關的
/// approverUserId 本人，不是 project 存取權，所以不掛在 projects/:id 底下。
@UseGuards(JwtAuthGuard)
@Controller('payment-requests')
export class PaymentRequestStagesController {
  constructor(private readonly paymentRequestsService: PaymentRequestsService) {}

  @Get('pending')
  pendingForMe(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentRequestsService.pendingForMe(user.id);
  }

  @Post(':paymentRequestId/stages/:stage/decide')
  decideStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentRequestId') paymentRequestId: string,
    @Param('stage') stage: PaymentRequestStage,
    @Body() dto: DecidePaymentRequestStageDto,
  ) {
    return this.paymentRequestsService.decideStage(user.id, paymentRequestId, stage, dto);
  }
}
