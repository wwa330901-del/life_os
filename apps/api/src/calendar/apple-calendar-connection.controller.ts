import { BadGatewayException, Body, Controller, Delete, Get, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarAccessService } from './calendar-access.service';
import { AppleCalendarService } from './apple-calendar.service';
import { AppleCalendarSyncService } from './apple-calendar-sync.service';
import { DiscoverAppleCalendarsDto } from './dto/discover-apple-calendars.dto';
import { ConnectAppleCalendarDto } from './dto/connect-apple-calendar.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/calendar/apple')
export class AppleCalendarConnectionController {
  private readonly logger = new Logger(AppleCalendarConnectionController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CalendarAccessService,
    private readonly appleCalendar: AppleCalendarService,
    private readonly sync: AppleCalendarSyncService,
  ) {}

  @Get('connection')
  async getStatus(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    const connection = await this.prisma.appleCalendarConnection.findUnique({ where: { spaceId } });
    return {
      connected: Boolean(connection),
      appleId: connection?.appleId ?? null,
      selectedCalendarUrls: connection?.selectedCalendarUrls ?? [],
      lastSyncedAt: connection?.lastSyncedAt ?? null,
    };
  }

  /// 第一步——只驗證帳密、列出這個 Apple ID 能看到的所有日曆，不會存進
  /// 資料庫。使用者接下來要在這份清單裡勾選要同步哪幾個，才會呼叫 connect。
  @Post('discover')
  async discover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: DiscoverAppleCalendarsDto,
  ) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    const calendars = await this.appleCalendar.discoverCalendars(dto.appleId, dto.appPassword);
    return { calendars };
  }

  @Post('connect')
  async connect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: ConnectAppleCalendarDto,
  ) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    await this.prisma.appleCalendarConnection.upsert({
      where: { spaceId },
      create: {
        spaceId,
        appleId: dto.appleId,
        appPassword: dto.appPassword,
        selectedCalendarUrls: dto.selectedCalendarUrls,
        connectedByUserId: user.id,
      },
      update: {
        appleId: dto.appleId,
        appPassword: dto.appPassword,
        selectedCalendarUrls: dto.selectedCalendarUrls,
        connectedByUserId: user.id,
      },
    });
    // 同 Google 連結的慣例——連結本身已經存好了，第一次同步失敗不代表連結
    // 失敗，5 分鐘背景排程會重試。
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
    // 斷開連結時，把之前匯入的事件一併清掉——這些事件只是 iCloud 的鏡像,
    // 沒有連結來源之後留著也沒有意義，還可能誤導使用者以為還在同步。
    await this.prisma.$transaction([
      this.prisma.calendarEvent.deleteMany({ where: { spaceId, appleEventUid: { not: null } } }),
      this.prisma.appleCalendarConnection.deleteMany({ where: { spaceId } }),
    ]);
    return { connected: false };
  }

  @Post('sync')
  async syncNow(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.access.assertCalendarSpace(user.id, spaceId);
    try {
      await this.sync.syncSpace(spaceId);
    } catch (error) {
      this.logger.warn(`手動同步失敗：${error}`);
      throw new BadGatewayException(`跟 iCloud 行事曆同步失敗：${error instanceof Error ? error.message : error}`);
    }
    return { synced: true };
  }
}
