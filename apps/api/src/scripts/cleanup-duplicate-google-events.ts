import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../calendar/google-calendar.service';

/**
 * One-off cleanup for the 2026-08-12 duplicate-event bug: before the fix in
 * `calendar-sync.service.ts`, events imported one-way from iCloud
 * (`appleEventUid` set) were also being pushed to Google Calendar as new
 * events, because the "push unpushed local events" query didn't exclude
 * them. Any `CalendarEvent` row with BOTH `appleEventUid` and
 * `googleEventId` set is such a duplicate: delete the Google-side copy and
 * clear `googleEventId` locally so the row goes back to being purely the
 * iCloud-imported event it started as. Safe to re-run — no-ops once clean.
 *
 * Run in production via Render's Web Shell:
 *   node dist/scripts/cleanup-duplicate-google-events.js
 */
@Module({ imports: [PrismaModule], providers: [GoogleCalendarService] })
class CleanupModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(CleanupModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService);
  const google = app.get(GoogleCalendarService);

  const duplicates = await prisma.calendarEvent.findMany({
    where: { appleEventUid: { not: null }, googleEventId: { not: null } },
  });

  console.log(`找到 ${duplicates.length} 筆被誤推到 Google 的 iCloud 匯入事件`);

  const connectionsBySpace = new Map<string, Awaited<ReturnType<typeof prisma.googleCalendarConnection.findUnique>>>();

  let deleted = 0;
  let failed = 0;
  for (const event of duplicates) {
    let connection = connectionsBySpace.get(event.spaceId);
    if (connection === undefined) {
      connection = await prisma.googleCalendarConnection.findUnique({ where: { spaceId: event.spaceId } });
      connectionsBySpace.set(event.spaceId, connection);
    }
    if (!connection) {
      console.warn(`space ${event.spaceId} 已無 Google 連結，略過事件 ${event.id}（僅清本機欄位）`);
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { googleEventId: null } });
      continue;
    }
    try {
      await google.deleteEvent(connection, event.googleEventId!);
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { googleEventId: null } });
      deleted++;
    } catch (error) {
      failed++;
      console.warn(`刪除事件 ${event.id}（Google event ${event.googleEventId}）失敗：${error}`);
    }
  }

  console.log(`完成：成功清除 ${deleted} 筆，失敗 ${failed} 筆`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
