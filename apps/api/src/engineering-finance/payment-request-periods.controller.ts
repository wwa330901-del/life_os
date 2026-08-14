import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentRequestPeriodsService } from './payment-request-periods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreatePaymentRequestPeriodDto } from './dto/create-payment-request-period.dto';
import { AddAdditionalChargeDto } from './dto/add-additional-charge.dto';
import { SubmitFixedRoleApprovalDto } from './dto/submit-fixed-role-approval.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/payment-request-periods')
export class PaymentRequestPeriodsController {
  constructor(private readonly periodsService: PaymentRequestPeriodsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.periodsService.list(user.id, projectId);
  }

  @Get(':periodId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.periodsService.getOne(user.id, projectId, periodId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePaymentRequestPeriodDto,
  ) {
    return this.periodsService.create(user.id, projectId, dto);
  }

  @Post(':periodId/additional-charge')
  @UseInterceptors(FileInterceptor('file'))
  addAdditionalCharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('periodId') periodId: string,
    @Body() dto: AddAdditionalChargeDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.periodsService.addAdditionalCharge(
      user.id,
      projectId,
      periodId,
      dto,
      file,
    );
  }

  @Post(':periodId/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('periodId') periodId: string,
    @Body() dto: SubmitFixedRoleApprovalDto,
  ) {
    return this.periodsService.submit(user.id, projectId, periodId, dto);
  }

  @Get(':periodId/approvals')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.periodsService.history(user.id, projectId, periodId);
  }
}
