import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { taipeiDateKey } from '../common/taipei-date';
import { describeDate, nextOccurrence } from './important-dates';

/** How many memories go into every AI conversation — newest first. */
const CONTEXT_MEMORIES = 60;
/** 重要日子在幾天內就放進 AI 的背景資料。 */
const CONTEXT_DATE_DAYS = 30;

export interface ImportantDateInput {
  title: string;
  month: number;
  day: number;
  year?: number | null;
  isLunar?: boolean;
  note?: string | null;
}

/** AI 長期記憶＋重要日子（2026-10-01）。 */
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  // --- 記憶 ---

  listMemories(userId: string) {
    return this.prisma.userMemory.findMany({ where: { ownerUserId: userId }, orderBy: { updatedAt: 'desc' } });
  }

  async remember(userId: string, content: string, replaceId?: string | null) {
    const text = content.trim();
    if (!text) throw new BadRequestException('要記住的內容是空的');
    if (replaceId) {
      const existing = await this.prisma.userMemory.findFirst({ where: { id: replaceId, ownerUserId: userId } });
      if (existing) return this.prisma.userMemory.update({ where: { id: replaceId }, data: { content: text } });
    }
    return this.prisma.userMemory.create({ data: { ownerUserId: userId, content: text } });
  }

  async forget(userId: string, id: string) {
    const { count } = await this.prisma.userMemory.deleteMany({ where: { id, ownerUserId: userId } });
    if (count === 0) throw new NotFoundException('找不到這筆記憶');
    return { deleted: true };
  }

  // --- 重要日子 ---

  async listDates(userId: string, today = taipeiDateKey(new Date())) {
    const rows = await this.prisma.importantDate.findMany({ where: { ownerUserId: userId } });
    return rows
      .map((r) => ({ ...r, next: nextOccurrence(today, r) }))
      .sort((a, b) => a.next.daysLeft - b.next.daysLeft);
  }

  async addDate(userId: string, input: ImportantDateInput) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('要有名稱，例如「媽媽生日」');
    validateMonthDay(input.month, input.day);
    if (input.year != null && (input.year < 1900 || input.year > 2100)) throw new BadRequestException('年份不對');
    return this.prisma.importantDate.create({
      data: {
        ownerUserId: userId,
        title,
        month: input.month,
        day: input.day,
        year: input.year ?? null,
        isLunar: input.isLunar ?? false,
        note: input.note?.trim() || null,
      },
    });
  }

  async updateDate(userId: string, id: string, input: Partial<ImportantDateInput>) {
    const existing = await this.prisma.importantDate.findFirst({ where: { id, ownerUserId: userId } });
    if (!existing) throw new NotFoundException('找不到這個日子');
    validateMonthDay(input.month ?? existing.month, input.day ?? existing.day);
    return this.prisma.importantDate.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.month !== undefined && { month: input.month }),
        ...(input.day !== undefined && { day: input.day }),
        ...(input.year !== undefined && { year: input.year }),
        ...(input.isLunar !== undefined && { isLunar: input.isLunar }),
        ...(input.note !== undefined && { note: input.note?.trim() || null }),
        lastRemindedKey: null,
      },
    });
  }

  async deleteDate(userId: string, id: string) {
    const { count } = await this.prisma.importantDate.deleteMany({ where: { id, ownerUserId: userId } });
    if (count === 0) throw new NotFoundException('找不到這個日子');
    return { deleted: true };
  }

  /** 放進 AI 系統提示的背景：記住的事＋30 天內的重要日子。 */
  async contextText(userId: string): Promise<string> {
    const [memories, dates] = await Promise.all([
      this.prisma.userMemory.findMany({ where: { ownerUserId: userId }, orderBy: { updatedAt: 'desc' }, take: CONTEXT_MEMORIES }),
      this.listDates(userId),
    ]);
    const soon = dates.filter((d) => d.next.daysLeft <= CONTEXT_DATE_DAYS);
    return [
      '你記得關於他的事（id：內容）：',
      ...(memories.length ? memories.map((m) => `- ${m.id}：${m.content}`) : ['（還沒有）']),
      `接下來 ${CONTEXT_DATE_DAYS} 天的重要日子：`,
      ...(soon.length
        ? soon.map(
            (d) =>
              `- ${d.title}：${d.next.date}（${d.next.daysLeft === 0 ? '今天' : `${d.next.daysLeft} 天後`}，${describeDate(d)}${d.next.years != null ? `，${d.next.years} 週年/歲` : ''}）${d.note ? `，備註：${d.note}` : ''}`,
          )
        : ['（沒有）']),
    ].join('\n');
  }
}

function validateMonthDay(month: number, day: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException('月份要是 1～12');
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new BadRequestException('日期要是 1～31');
}
