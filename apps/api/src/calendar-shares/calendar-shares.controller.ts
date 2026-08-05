import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CalendarSharesService } from './calendar-shares.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { InviteCalendarShareDto } from './dto/invite-calendar-share.dto';
import { UpdateCalendarShareDetailLevelDto } from './dto/update-calendar-share-detail-level.dto';
import { UpdateCalendarShareColorDto } from './dto/update-calendar-share-color.dto';

@UseGuards(JwtAuthGuard)
@Controller('calendar-shares')
export class CalendarSharesController {
  constructor(private readonly service: CalendarSharesService) {}

  @Post('invite')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteCalendarShareDto) {
    return this.service.invite(user.id, dto.email);
  }

  @Get('given')
  listGiven(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listGiven(user.id);
  }

  @Get('received')
  listReceived(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listReceived(user.id);
  }

  @Get('combined-events')
  combinedEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.combinedEvents(user.id, from, to);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.accept(user.id, id);
  }

  @Patch(':id/detail-level')
  updateDetailLevel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarShareDetailLevelDto,
  ) {
    return this.service.updateDetailLevel(user.id, id, dto.detailLevel);
  }

  @Patch(':id/color')
  updateColor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarShareColorDto,
  ) {
    return this.service.updateColor(user.id, id, dto.viewerColor);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
