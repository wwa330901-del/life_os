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
import { EngineeringQuotationService } from './engineering-quotation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateQuotationItemDto } from './dto/create-quotation-item.dto';
import { UpdateQuotationItemDto } from './dto/update-quotation-item.dto';
import { ReorderQuotationItemDto } from './dto/reorder-quotation-item.dto';
import { ApplyMarginTargetDto } from './dto/apply-margin-target.dto';
import { ApplyNegotiatedTotalDto } from './dto/apply-negotiated-total.dto';
import { CreateSurchargeItemDto } from './dto/create-surcharge-item.dto';
import { UpdateSurchargeItemDto } from './dto/update-surcharge-item.dto';
import { ReorderSurchargeItemDto } from './dto/reorder-surcharge-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/engineering-quotation')
export class EngineeringQuotationController {
  constructor(private readonly quotationService: EngineeringQuotationService) {}

  @Get()
  getTree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.quotationService.getTree(user.id, projectId);
  }

  @Post('items')
  createItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateQuotationItemDto,
  ) {
    return this.quotationService.createItem(user.id, projectId, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuotationItemDto,
  ) {
    return this.quotationService.updateItem(user.id, projectId, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quotationService.removeItem(user.id, projectId, itemId);
  }

  @Patch('items/:itemId/reorder')
  reorderItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReorderQuotationItemDto,
  ) {
    return this.quotationService.reorderItem(user.id, projectId, itemId, dto);
  }

  @Post('apply-margin-target')
  applyMarginTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: ApplyMarginTargetDto,
  ) {
    return this.quotationService.applyMarginTarget(user.id, projectId, dto);
  }

  @Post('apply-negotiated-total')
  applyNegotiatedTotal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: ApplyNegotiatedTotalDto,
  ) {
    return this.quotationService.applyNegotiatedTotal(user.id, projectId, dto);
  }

  @Post('surcharges')
  createSurcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSurchargeItemDto,
  ) {
    return this.quotationService.createSurcharge(user.id, projectId, dto);
  }

  @Patch('surcharges/:surchargeId')
  updateSurcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('surchargeId') surchargeId: string,
    @Body() dto: UpdateSurchargeItemDto,
  ) {
    return this.quotationService.updateSurcharge(
      user.id,
      projectId,
      surchargeId,
      dto,
    );
  }

  @Delete('surcharges/:surchargeId')
  removeSurcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('surchargeId') surchargeId: string,
  ) {
    return this.quotationService.removeSurcharge(
      user.id,
      projectId,
      surchargeId,
    );
  }

  @Patch('surcharges/:surchargeId/reorder')
  reorderSurcharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('surchargeId') surchargeId: string,
    @Body() dto: ReorderSurchargeItemDto,
  ) {
    return this.quotationService.reorderSurcharge(
      user.id,
      projectId,
      surchargeId,
      dto,
    );
  }
}
