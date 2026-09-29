import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LifeGoalsService } from './life-goals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { LifeGoalStatus } from '../../generated/prisma/client.js';
import { CreateLifeGoalDto } from './dto/create-life-goal.dto';
import { UpdateLifeGoalDto } from './dto/update-life-goal.dto';
import { CreateLifeGoalCheckInDto } from './dto/create-life-goal-check-in.dto';
import { SuggestLifeGoalCategoryDto } from './dto/suggest-life-goal-category.dto';
import { LifeGoalCategoryService } from './life-goal-category.service';

@UseGuards(JwtAuthGuard)
@Controller('life-goals')
export class LifeGoalsController {
  constructor(
    private readonly service: LifeGoalsService,
    private readonly categories: LifeGoalCategoryService,
  ) {}

  @Get()
  listAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: LifeGoalStatus) {
    return this.service.listAll(user.id, status);
  }

  @Get('tracking-options')
  trackingOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.trackingOptions(user.id);
  }

  /** AI 自動分類 — see LifeGoalCategoryService. */
  @Post('suggest-category')
  suggestCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: SuggestLifeGoalCategoryDto) {
    return this.categories.suggest(user.id, dto.title, dto.category);
  }

  @Get(':id/check-ins')
  listCheckIns(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.listCheckIns(user.id, id);
  }

  @Post(':id/check-ins')
  addCheckIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateLifeGoalCheckInDto,
  ) {
    return this.service.addCheckIn(user.id, id, dto);
  }

  @Delete('check-ins/:checkInId')
  removeCheckIn(@CurrentUser() user: AuthenticatedUser, @Param('checkInId') checkInId: string) {
    return this.service.removeCheckIn(user.id, checkInId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLifeGoalDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLifeGoalDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
