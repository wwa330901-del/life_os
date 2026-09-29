import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LifeGoalsService } from './life-goals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { LifeGoalStatus } from '../../generated/prisma/client.js';
import { CreateLifeGoalDto } from './dto/create-life-goal.dto';
import { UpdateLifeGoalDto } from './dto/update-life-goal.dto';

@UseGuards(JwtAuthGuard)
@Controller('life-goals')
export class LifeGoalsController {
  constructor(private readonly service: LifeGoalsService) {}

  @Get()
  listAll(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: LifeGoalStatus) {
    return this.service.listAll(user.id, status);
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
