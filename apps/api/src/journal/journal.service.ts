import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';

const DEFAULT_LIST_LIMIT = 100;

function dateKey(date: string | undefined): Date {
  return taipeiDateKeyToUtcMidnight(date ? date.slice(0, 10) : taipeiDateKey(new Date()));
}

function cleanTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}

/** 日記 (2026-10-01). Every entry belongs to one user; the App and the 萬用
 * AI both write through here. */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. `from`/`to` are inclusive YYYY-MM-DD. */
  list(userId: string, filter: { from?: string; to?: string; keyword?: string; limit?: number } = {}) {
    return this.prisma.journalEntry.findMany({
      where: {
        ownerUserId: userId,
        ...((filter.from || filter.to) && {
          date: {
            ...(filter.from && { gte: dateKey(filter.from) }),
            ...(filter.to && { lte: dateKey(filter.to) }),
          },
        }),
        ...(filter.keyword && {
          OR: [
            { content: { contains: filter.keyword, mode: 'insensitive' as const } },
            { tags: { has: filter.keyword } },
          ],
        }),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit ?? DEFAULT_LIST_LIMIT,
    });
  }

  create(userId: string, dto: CreateJournalEntryDto) {
    return this.prisma.journalEntry.create({
      data: {
        ownerUserId: userId,
        date: dateKey(dto.date),
        content: dto.content.trim(),
        mood: dto.mood ?? null,
        tags: cleanTags(dto.tags) ?? [],
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateJournalEntryDto) {
    await this.getOwn(userId, id);
    return this.prisma.journalEntry.update({
      where: { id },
      data: {
        ...(dto.content !== undefined && { content: dto.content.trim() }),
        ...(dto.date !== undefined && { date: dateKey(dto.date) }),
        ...(dto.mood !== undefined && { mood: dto.mood }),
        ...(dto.tags !== undefined && { tags: cleanTags(dto.tags) }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.getOwn(userId, id);
    await this.prisma.journalEntry.delete({ where: { id } });
    return { deleted: true };
  }

  /** 回顧用：這段期間寫了幾天、平均心情。`start`/`end` 是 date-only key，end 不含。 */
  async stats(userId: string, start: Date, end: Date) {
    const entries = await this.prisma.journalEntry.findMany({
      where: { ownerUserId: userId, date: { gte: start, lt: end } },
      select: { date: true, mood: true, tags: true },
    });
    const days = new Set(entries.map((e) => e.date.toISOString().slice(0, 10))).size;
    const moods = entries.map((e) => e.mood).filter((m): m is number => m != null);
    const tagCount = new Map<string, number>();
    for (const e of entries) for (const t of e.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    return {
      entries: entries.length,
      days,
      averageMood: moods.length > 0 ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null,
      topTags: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t),
    };
  }

  private async getOwn(userId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, ownerUserId: userId } });
    if (!entry) throw new NotFoundException('找不到這則日記');
    return entry;
  }
}
