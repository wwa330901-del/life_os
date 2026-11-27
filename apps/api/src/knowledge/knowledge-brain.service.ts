import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeItemStatus } from '../../generated/prisma/client.js';
import type { BrainAnalysis } from './ai/ai-content-analysis.interface';
import { sourceKeyForUrl } from './knowledge-source-key';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight } from '../common/taipei-date';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 知識庫大腦（2026-11-27）：像 Obsidian——每則收藏是一個點，AI 幫它接到
 * 「主題點」和其他相關的收藏上。這裡管主題、連線、看過沒看過、重複偵測、
 * 首頁要顯示的東西、大腦地圖的資料。東西永遠只放在知識庫，不分送到別的功能。 */
@Injectable()
export class KnowledgeBrainService {
  private readonly logger = new Logger(KnowledgeBrainService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 舊資料只有網址沒有鑰匙的，開機時補上（重複偵測才抓得到舊的）。 */
  async onApplicationBootstrap() {
    setTimeout(() => void this.backfillSourceKeys().catch((e) => this.logger.warn(`補來源鑰匙失敗：${e}`)), 60_000);
  }

  private async backfillSourceKeys() {
    const rows = await this.prisma.knowledgeItem.findMany({
      where: { sourceKey: null, sourceUrl: { not: null } },
      select: { id: true, sourceUrl: true },
      take: 2000,
    });
    for (const row of rows) {
      const key = sourceKeyForUrl(row.sourceUrl!);
      if (key) await this.prisma.knowledgeItem.update({ where: { id: row.id }, data: { sourceKey: key } });
    }
  }

  // ---------- 重複偵測 ----------

  /** 同一個來源已經存過（分析完或正在分析）就回那一則；分析失敗的不算。 */
  async findDuplicate(ownerUserId: string, sourceKey: string | null) {
    if (!sourceKey) return null;
    return this.prisma.knowledgeItem.findFirst({
      where: { ownerUserId, sourceKey, status: { not: KnowledgeItemStatus.FAILED } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, status: true, createdAt: true, eventEndDate: true },
    });
  }

  duplicateMessage(dup: { title: string | null; status: KnowledgeItemStatus; createdAt: Date; eventEndDate: Date | null }): string {
    if (dup.status !== KnowledgeItemStatus.DONE) return '這個剛剛傳過了，還在分析中，好了會通知你。';
    const d = new Date(dup.createdAt.getTime() + 8 * 3600 * 1000);
    const left = dup.eventEndDate ? this.daysLeft(dup.eventEndDate) : null;
    const tail = left !== null && left >= 0 ? `（還剩 ${left} 天）` : '';
    return `這個你 ${d.getUTCMonth() + 1}/${d.getUTCDate()} 存過了：「${dup.title ?? '未命名'}」${tail}。\n內容一樣，我沒有再存一份。`;
  }

  // ---------- 給 AI 的背景 ----------

  async aiContext(ownerUserId: string, excludeItemId?: string) {
    const [topics, recent] = await Promise.all([
      this.prisma.knowledgeTopic.findMany({ where: { ownerUserId }, select: { name: true }, take: 300, orderBy: { createdAt: 'asc' } }),
      this.prisma.knowledgeItem.findMany({
        where: { ownerUserId, status: KnowledgeItemStatus.DONE, ...(excludeItemId && { id: { not: excludeItemId } }) },
        orderBy: { createdAt: 'desc' },
        take: 150,
        select: { id: true, title: true, topics: { select: { topic: { select: { name: true } } } } },
      }),
    ]);
    return {
      existingTopics: topics.map((t) => t.name),
      relatedCandidates: recent.map((r) => ({ id: r.id, title: r.title ?? '未命名', topics: r.topics.map((t) => t.topic.name) })),
    };
  }

  /** 分析完：接上主題點、連到相關的舊收藏、記活動日期。回傳主題名稱和連了幾則。 */
  async applyBrain(itemId: string, ownerUserId: string, brain: BrainAnalysis): Promise<{ topics: string[]; linked: number }> {
    const topicIds: string[] = [];
    for (const name of brain.topics) {
      const topic = await this.prisma.knowledgeTopic.upsert({
        where: { ownerUserId_name: { ownerUserId, name } },
        create: { ownerUserId, name },
        update: {},
      });
      topicIds.push(topic.id);
    }

    const relatedIds = [...new Set(brain.related.map((r) => r.id))].filter((id) => id !== itemId);
    const valid = relatedIds.length
      ? await this.prisma.knowledgeItem.findMany({ where: { id: { in: relatedIds }, ownerUserId }, select: { id: true } })
      : [];
    const validIds = new Set(valid.map((v) => v.id));
    // 反方向已經有同一條線的不用再存一次（查的時候兩邊都算）。
    const reverse = new Set(await this.reverseLinked(itemId));
    const links = brain.related.filter(
      (r, i, all) => validIds.has(r.id) && !reverse.has(r.id) && all.findIndex((x) => x.id === r.id) === i,
    );

    await this.prisma.$transaction([
      // 重新分析時主題換新的；舊的主題點留著（別的收藏可能還用）。
      ...(topicIds.length ? [this.prisma.knowledgeItemTopic.deleteMany({ where: { itemId } })] : []),
      ...topicIds.map((topicId) => this.prisma.knowledgeItemTopic.create({ data: { itemId, topicId } })),
      this.prisma.knowledgeItemLink.deleteMany({ where: { fromItemId: itemId } }),
      ...links.map((l) =>
        this.prisma.knowledgeItemLink.create({ data: { fromItemId: itemId, toItemId: l.id, reason: l.reason.slice(0, 80) } }),
      ),
      this.prisma.knowledgeItem.update({
        where: { id: itemId },
        data: {
          eventStartDate: brain.eventStartDate ? taipeiDateKeyToUtcMidnight(brain.eventStartDate) : null,
          eventEndDate: brain.eventEndDate ? taipeiDateKeyToUtcMidnight(brain.eventEndDate) : null,
        },
      }),
    ]);
    return { topics: brain.topics, linked: links.length + [...reverse].filter((id) => validIds.has(id)).length };
  }

  private async reverseLinked(itemId: string): Promise<string[]> {
    const rows = await this.prisma.knowledgeItemLink.findMany({ where: { toItemId: itemId }, select: { fromItemId: true } });
    return rows.map((r) => r.fromItemId);
  }

  /** 存好後 LINE 通知那句話。 */
  savedMessage(title: string | null, result: { topics: string[]; linked: number }, eventEndDate: string | null): string {
    const lines = [`🧠 已存進大腦：「${title ?? '未命名'}」`];
    if (result.topics.length) lines.push(`主題：${result.topics.join('、')}`);
    if (result.linked) lines.push(`跟你存過的 ${result.linked} 則有關，已經連起來了`);
    if (eventEndDate) {
      const left = this.daysLeft(taipeiDateKeyToUtcMidnight(eventEndDate));
      if (left >= 0) lines.push(`📅 ${eventEndDate.slice(5).replace('-', '/')} 結束（還剩 ${left} 天），快到了會提醒你`);
    }
    return lines.join('\n');
  }

  // ---------- 看過沒看過 ----------

  async setRead(userId: string, itemId: string, read: boolean) {
    await this.assertOwn(userId, itemId);
    await this.prisma.knowledgeItem.update({ where: { id: itemId }, data: { readAt: read ? new Date() : null } });
    return { read };
  }

  // ---------- 首頁 ----------

  async overview(userId: string) {
    const today = taipeiDateKeyToUtcMidnight(taipeiDateKey(new Date()));
    const soon = new Date(today.getTime() + 30 * DAY_MS);
    const [total, topicCount, events, unread, unreadCount, topTopics] = await Promise.all([
      this.prisma.knowledgeItem.count({ where: { ownerUserId: userId, status: KnowledgeItemStatus.DONE } }),
      this.prisma.knowledgeTopic.count({ where: { ownerUserId: userId } }),
      this.prisma.knowledgeItem.findMany({
        where: {
          ownerUserId: userId,
          status: KnowledgeItemStatus.DONE,
          exhibitionDecisionStatus: { not: 'CANCELLED' },
          OR: [
            { eventEndDate: { gte: today } },
            { eventEndDate: null, eventStartDate: { gte: today, lte: soon } },
          ],
        },
        orderBy: [{ eventEndDate: 'asc' }, { eventStartDate: 'asc' }],
        take: 6,
        select: { id: true, title: true, eventStartDate: true, eventEndDate: true },
      }),
      this.prisma.knowledgeItem.findMany({
        where: { ownerUserId: userId, status: KnowledgeItemStatus.DONE, readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, title: true, sourcePlatform: true, createdAt: true },
      }),
      this.prisma.knowledgeItem.count({ where: { ownerUserId: userId, status: KnowledgeItemStatus.DONE, readAt: null } }),
      this.prisma.knowledgeTopic.findMany({
        where: { ownerUserId: userId },
        select: { id: true, name: true, _count: { select: { items: true } } },
        orderBy: { items: { _count: 'desc' } },
        take: 12,
      }),
    ]);
    return {
      total,
      topicCount,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: e.eventStartDate ? e.eventStartDate.toISOString().slice(0, 10) : null,
        endDate: e.eventEndDate ? e.eventEndDate.toISOString().slice(0, 10) : null,
        daysLeft: e.eventEndDate ? this.daysLeft(e.eventEndDate) : null,
        started: !e.eventStartDate || e.eventStartDate <= today,
      })),
      unread,
      unreadCount,
      topTopics: topTopics.map((t) => ({ id: t.id, name: t.name, count: t._count.items })),
    };
  }

  // ---------- 大腦地圖 ----------

  async graph(userId: string) {
    const [topics, items, itemTopics, links] = await Promise.all([
      this.prisma.knowledgeTopic.findMany({
        where: { ownerUserId: userId },
        select: { id: true, name: true, _count: { select: { items: true } } },
      }),
      this.prisma.knowledgeItem.findMany({
        where: { ownerUserId: userId, status: KnowledgeItemStatus.DONE },
        select: { id: true, title: true, readAt: true, eventEndDate: true },
        orderBy: { createdAt: 'desc' },
        take: 1500,
      }),
      this.prisma.knowledgeItemTopic.findMany({ where: { item: { ownerUserId: userId } }, select: { itemId: true, topicId: true } }),
      this.prisma.knowledgeItemLink.findMany({ where: { fromItem: { ownerUserId: userId } }, select: { fromItemId: true, toItemId: true } }),
    ]);
    const itemIds = new Set(items.map((i) => i.id));
    return {
      topics: topics.map((t) => ({ id: t.id, name: t.name, count: t._count.items })),
      items: items.map((i) => ({ id: i.id, title: i.title ?? '未命名', read: i.readAt !== null, eventEndDate: i.eventEndDate?.toISOString().slice(0, 10) ?? null })),
      edges: [
        ...itemTopics.filter((e) => itemIds.has(e.itemId)).map((e) => ({ from: e.itemId, to: e.topicId, kind: 'topic' as const })),
        ...links.filter((l) => itemIds.has(l.fromItemId) && itemIds.has(l.toItemId)).map((l) => ({ from: l.fromItemId, to: l.toItemId, kind: 'item' as const })),
      ],
    };
  }

  /** 點開一則時右邊的「相關的」「連到這裡的主題」。 */
  async connections(userId: string, itemId: string) {
    await this.assertOwn(userId, itemId);
    const [topics, from, to] = await Promise.all([
      this.prisma.knowledgeItemTopic.findMany({
        where: { itemId },
        select: { topic: { select: { id: true, name: true, _count: { select: { items: true } } } } },
      }),
      this.prisma.knowledgeItemLink.findMany({ where: { fromItemId: itemId }, select: { reason: true, toItem: { select: { id: true, title: true } } } }),
      this.prisma.knowledgeItemLink.findMany({ where: { toItemId: itemId }, select: { reason: true, fromItem: { select: { id: true, title: true } } } }),
    ]);
    const related = [
      ...from.map((l) => ({ id: l.toItem.id, title: l.toItem.title ?? '未命名', reason: l.reason })),
      ...to.map((l) => ({ id: l.fromItem.id, title: l.fromItem.title ?? '未命名', reason: l.reason })),
    ].filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i);
    return {
      topics: topics.map((t) => ({ id: t.topic.id, name: t.topic.name, count: t.topic._count.items })),
      related,
    };
  }

  async topicItems(userId: string, topicId: string) {
    const topic = await this.prisma.knowledgeTopic.findUnique({ where: { id: topicId } });
    if (!topic || topic.ownerUserId !== userId) throw new NotFoundException('找不到這個主題');
    const rows = await this.prisma.knowledgeItemTopic.findMany({
      where: { topicId },
      select: { item: { select: { id: true, title: true, summary: true, readAt: true, createdAt: true, sourcePlatform: true } } },
      orderBy: { item: { createdAt: 'desc' } },
    });
    return { id: topic.id, name: topic.name, items: rows.map((r) => r.item) };
  }

  // ---------- 主題管理（改名、合併、刪除）----------

  async renameTopic(userId: string, topicId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('主題名稱不能是空的');
    const topic = await this.ownTopic(userId, topicId);
    const same = await this.prisma.knowledgeTopic.findUnique({ where: { ownerUserId_name: { ownerUserId: userId, name: trimmed } } });
    if (same && same.id !== topic.id) return this.mergeTopics(userId, topic.id, same.id);
    return this.prisma.knowledgeTopic.update({ where: { id: topic.id }, data: { name: trimmed } });
  }

  /** 把 source 合併進 target：source 的收藏都改接到 target，source 刪掉。 */
  async mergeTopics(userId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestException('不能跟自己合併');
    await this.ownTopic(userId, sourceId);
    const target = await this.ownTopic(userId, targetId);
    const rows = await this.prisma.knowledgeItemTopic.findMany({ where: { topicId: sourceId }, select: { itemId: true } });
    await this.prisma.$transaction([
      this.prisma.knowledgeItemTopic.createMany({ data: rows.map((r) => ({ itemId: r.itemId, topicId: targetId })), skipDuplicates: true }),
      this.prisma.knowledgeTopic.delete({ where: { id: sourceId } }),
    ]);
    return target;
  }

  async deleteTopic(userId: string, topicId: string) {
    await this.ownTopic(userId, topicId);
    await this.prisma.knowledgeTopic.delete({ where: { id: topicId } });
  }

  // ---------- 共用 ----------

  daysLeft(endDate: Date): number {
    const today = taipeiDateKeyToUtcMidnight(taipeiDateKey(new Date()));
    return Math.round((endDate.getTime() - today.getTime()) / DAY_MS);
  }

  private async ownTopic(userId: string, topicId: string) {
    const topic = await this.prisma.knowledgeTopic.findUnique({ where: { id: topicId } });
    if (!topic || topic.ownerUserId !== userId) throw new NotFoundException('找不到這個主題');
    return topic;
  }

  private async assertOwn(userId: string, itemId: string) {
    const item = await this.prisma.knowledgeItem.findUnique({ where: { id: itemId }, select: { ownerUserId: true } });
    if (!item || item.ownerUserId !== userId) throw new NotFoundException('找不到這則收藏');
  }
}
