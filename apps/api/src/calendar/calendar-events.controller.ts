import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CalendarEventsService } from './calendar-events.service';
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto';
import { UpdateCalendarEventOccurrenceDto } from './dto/update-calendar-event-occurrence.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/calendar/events')
export class CalendarEventsController {
  constructor(private readonly service: CalendarEventsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(user.id, spaceId, from, to);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string, @Body() dto: CreateCalendarEventDto) {
    return this.service.create(user.id, spaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.service.update(user.id, spaceId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string, @Param('id') id: string) {
    return this.service.remove(user.id, spaceId, id);
  }

  /// `:id` here is always the SERIES id (the recurring event's own base
  /// row) — 只改這次／這次以後／全部 all reference the series plus a
  /// specific occurrence date, never a per-occurrence id (most occurrences
  /// aren't their own row — see CalendarEventsService.list's doc comment).
  @Patch(':id/occurrence')
  updateOccurrence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventOccurrenceDto,
  ) {
    return this.service.updateOccurrence(user.id, spaceId, id, dto);
  }

  @Delete(':id/occurrence')
  removeOccurrence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Query('occurrenceDate') occurrenceDate: string,
    @Query('scope') scope: 'THIS' | 'FOLLOWING' | 'ALL',
  ) {
    return this.service.removeOccurrence(user.id, spaceId, id, occurrenceDate, scope);
  }
}
