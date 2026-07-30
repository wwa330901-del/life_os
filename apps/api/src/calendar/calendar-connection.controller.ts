import { Body, Controller, Delete, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
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
  private readonly logger = new Logger(CalendarConnectionController.name);

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
    // The token is already saved at this point — a failure in this first
    // sync attempt (e.g. Calendar API not yet enabled on the Google Cloud
    // project) shouldn't make the connect action itself look like it
    // failed. The 5-minute background cron retries it regardless.
    try {
      await this.sync.syncSpace(spaceId);
    } catch (error) {
      this.logger.warn(`連結成功但第一次同步失敗（會由背景排程重試）：${error}`);
    }
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
