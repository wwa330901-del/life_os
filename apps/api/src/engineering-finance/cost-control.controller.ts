import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CostControlService } from './cost-control.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateCostControlRowDto } from './dto/create-cost-control-row.dto';
import { UpdateCostControlRowDto } from './dto/update-cost-control-row.dto';
import { ReorderCostControlRowDto } from './dto/reorder-cost-control-row.dto';
import { SetCostControlRowItemsDto } from './dto/set-cost-control-row-items.dto';
import { CreateCostControlAdjustmentDto } from './dto/create-cost-control-adjustment.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/cost-control-rows')
export class CostControlController {
  constructor(private readonly costControlService: CostControlService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.costControlService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateCostControlRowDto,
  ) {
    return this.costControlService.create(user.id, projectId, dto);
  }

  @Patch(':rowId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateCostControlRowDto,
  ) {
    return this.costControlService.update(user.id, projectId, rowId, dto);
  }

  @Delete(':rowId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.costControlService.remove(user.id, projectId, rowId);
  }

  @Patch(':rowId/reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: ReorderCostControlRowDto,
  ) {
    return this.costControlService.reorder(user.id, projectId, rowId, dto);
  }

  @Patch(':rowId/quotation-items')
  setQuotationItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: SetCostControlRowItemsDto,
  ) {
    return this.costControlService.setQuotationItems(user.id, projectId, rowId, dto);
  }

  @Get(':rowId/breakdown')
  breakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
  ) {
    return this.costControlService.breakdown(user.id, projectId, rowId);
  }

  @Post(':rowId/adjustments')
  addAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Body() dto: CreateCostControlAdjustmentDto,
  ) {
    return this.costControlService.addAdjustment(user.id, projectId, rowId, dto);
  }

  @Delete(':rowId/adjustments/:adjustmentId')
  removeAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rowId') rowId: string,
    @Param('adjustmentId') adjustmentId: string,
  ) {
    return this.costControlService.removeAdjustment(user.id, projectId, rowId, adjustmentId);
  }
}
