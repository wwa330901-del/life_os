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
import { CostControlService } from './cost-control.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateCostControlRowDto } from './dto/create-cost-control-row.dto';
import { UpdateCostControlRowDto } from './dto/update-cost-control-row.dto';
import { ReorderCostControlRowDto } from './dto/reorder-cost-control-row.dto';
import { SetCostControlRowItemsDto } from './dto/set-cost-control-row-items.dto';
import { CreateCostControlAdjustmentDto } from './dto/create-cost-control-adjustment.dto';
import { SubmitFixedRoleApprovalDto } from './dto/submit-fixed-role-approval.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId')
export class CostControlController {
  constructor(private readonly costControlService: CostControlService) {}

  // --- ①初始管制表 ------------------------------------------------------

  @Get('cost-control-initial-sheet')
  getInitialSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.costControlService.getInitialSheet(user.id, projectId);
  }

  @Post('cost-control-initial-sheet/submit')
  submitInitialSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SubmitFixedRoleApprovalDto,
  ) {
    return this.costControlService.submitInitialSheet(user.id, projectId, dto);
  }

  @Get('cost-control-initial-sheet/approvals')
  initialSheetHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.costControlService.initialSheetHistory(user.id, projectId);
  }

  // --- ②拆項表／③執行中成控表 --------------------------------------------

  @Get('cost-control-rows')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.costControlService.list(user.id, projectId);
  }

  @Post('cost-control-rows')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateCostControlRowDto,
  ) {
    return this.costControlService.create(user.id, projectId, dto);
  }

  @Patch('cost-control-rows/:rowId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateCostControlRowDto,
  ) {
    return this.costControlService.update(user.id, projectId, rowId, dto);
  }

  @Delete('cost-control-rows/:rowId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.costControlService.remove(user.id, projectId, rowId);
  }

  @Patch('cost-control-rows/:rowId/reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: ReorderCostControlRowDto,
  ) {
    return this.costControlService.reorder(user.id, projectId, rowId, dto);
  }

  @Patch('cost-control-rows/:rowId/quotation-items')
  setQuotationItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: SetCostControlRowItemsDto,
  ) {
    return this.costControlService.setQuotationItems(
      user.id,
      projectId,
      rowId,
      dto,
    );
  }

  @Get('cost-control-rows/:rowId/breakdown')
  breakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.costControlService.breakdown(user.id, projectId, rowId);
  }

  @Post('cost-control-rows/:rowId/owner-adjustments')
  addOwnerAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: CreateCostControlAdjustmentDto,
  ) {
    return this.costControlService.addOwnerAdjustment(
      user.id,
      projectId,
      rowId,
      dto,
    );
  }

  @Delete('cost-control-rows/:rowId/adjustments/:adjustmentId')
  removeAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Param('adjustmentId') adjustmentId: string,
  ) {
    return this.costControlService.removeAdjustment(
      user.id,
      projectId,
      rowId,
      adjustmentId,
    );
  }
}
