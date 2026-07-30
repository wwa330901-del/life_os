import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarAccessService } from './calendar-access.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarSyncService } from './calendar-sync.service';
import { ConnectGoogleCalendarDto } from './dto/connect-google-calendar.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/calendar')
export class CalendarConnectionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
    private readonly google: GoogleCalendarService,
    private readonly sync: CalendarSyncService,
  ) {}

  @Get('connection')
  async getStatus(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    const connection = await this.prisma.googleCalendarConnection.findUnique({ where: { spaceId } });
    return { connected: Boolean(connection), lastSyncedAt: connection?.lastSyncedAt ?? null };
  }

  @Post('connect')
  async connect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: ConnectGoogleCalendarDto,
  ) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    await this.google.connect(spaceId, user.id, dto.code, dto.redirectUri);
    await this.sync.syncSpace(spaceId);
    return { connected: true };
  }

  @Delete('connect')
  async disconnect(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    await this.google.disconnect(spaceId);
    return { connected: false };
  }

  @Post('sync')
  async syncNow(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    await this.sync.syncSpace(spaceId);
    return { synced: true };
  }
}
