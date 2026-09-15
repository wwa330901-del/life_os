import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OwnerBillingPeriodsService } from './owner-billing-periods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateOwnerBillingPeriodDto } from './dto/create-owner-billing-period.dto';
import { UpdateOwnerBillingPeriodDto } from './dto/update-owner-billing-period.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/owner-billing-periods')
export class OwnerBillingPeriodsController {
  constructor(private readonly periodsService: OwnerBillingPeriodsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.periodsService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateOwnerBillingPeriodDto,
  ) {
    return this.periodsService.create(user.id, projectId, dto);
  }

  @Patch(':periodId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('periodId') periodId: string,
    @Body() dto: UpdateOwnerBillingPeriodDto,
  ) {
    return this.periodsService.update(user.id, projectId, periodId, dto);
  }

  @Delete(':periodId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.periodsService.remove(user.id, projectId, periodId);
  }
}
