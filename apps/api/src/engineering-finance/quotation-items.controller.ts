import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { QuotationItemsService } from './quotation-items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateQuotationItemDto } from './dto/create-quotation-item.dto';
import { UpdateQuotationItemDto } from './dto/update-quotation-item.dto';
import { ReorderQuotationItemDto } from './dto/reorder-quotation-item.dto';
import { ApplyQuotationTargetDto } from './dto/apply-quotation-target.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/quotation-items')
export class QuotationItemsController {
  constructor(private readonly quotationItemsService: QuotationItemsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.quotationItemsService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateQuotationItemDto,
  ) {
    return this.quotationItemsService.create(user.id, projectId, dto);
  }

  @Post('apply-target')
  applyTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: ApplyQuotationTargetDto,
  ) {
    return this.quotationItemsService.applyTarget(user.id, projectId, dto);
  }

  @Patch(':itemId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuotationItemDto,
  ) {
    return this.quotationItemsService.update(user.id, projectId, itemId, dto);
  }

  @Patch(':itemId/reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReorderQuotationItemDto,
  ) {
    return this.quotationItemsService.reorder(user.id, projectId, itemId, dto);
  }

  @Delete(':itemId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.quotationItemsService.remove(user.id, projectId, itemId);
  }
}
