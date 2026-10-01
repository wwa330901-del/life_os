import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { taipeiDateKey, taipeiDateKeyToUtcMidnight, utcDateKey } from '../common/taipei-date';
import { HealthRecordType } from '../../generated/prisma/client.js';
import type { HealthRecord } from '../../generated/prisma/client.js';
import { formatMinutes, MAX_SLEEP_MINUTES, parseInstantList, parseNumber, sleepSpan } from './health-parse';

const DEFAULT_LIST_LIMIT = 200;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SHORT_SLEEP_MINUTES = 6 * 60;
/** 「起床」this soon after 「睡覺」is someone testing the 捷徑, not a night. */
const MIN_NIGHT_MINUTES = 30;

export interface HealthRecordInput {
  type: HealthRecordType;
  /** YYYY-MM-DD；SLEEP 不填就用起床時間那天，其他不填＝今天 */
  date?: string;
  startAt?: Date;
  endAt?: Date;
  minutes?: number;
  value?: number;
  activity?: string;
  note?: string;
}

function dateKey(date: string | undefined): Date {
  return taipeiDateKeyToUtcMidnight(date ? date.slice(0, 10) : taipeiDateKey(new Date()));
}

/** 健康（2026-10-01）：睡眠、運動、體重、步數。App、萬用 AI、iPhone 捷徑都寫進這裡。 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. `from`/`to` inclusive YYYY-MM-DD. */
  list(userId: string, filter: { type?: HealthRecordType; from?: string; to?: string; limit?: number } = {}) {
    return this.prisma.healthRecord.findMany({
      where: {
        ownerUserId: userId,
        ...(filter.type && { type: filter.type }),
        ...((filter.from || filter.to) && {
          date: {
            ...(filter.from && { gte: dateKey(filter.from) }),
            ...(filter.to && { lte: dateKey(filter.to) }),
          },
        }),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit ?? DEFAULT_LIST_LIMIT,
    });
  }

  create(userId: string, input: HealthRecordInput, source = 'MANUAL') {
    return this.prisma.healthRecord.create({ data: { ownerUserId: userId, source, ...this.normalize(input) } });
  }

  async update(userId: string, id: string, input: HealthRecordInput) {
    await this.getOwn(userId, id);
    return this.prisma.healthRecord.update({ where: { id }, data: this.normalize(input) });
  }

  async remove(userId: string, id: string) {
    await this.getOwn(userId, id);
    await this.prisma.healthRecord.delete({ where: { id } });
    return { deleted: true };
  }

  /** Validates per type and fills what can be derived (sleep minutes/date from start/end). */
  private normalize(input: HealthRecordInput) {
    const base = { type: input.type, note: input.note?.trim() || null };
    switch (input.type) {
      case HealthRecordType.SLEEP: {
        let minutes = input.minutes ?? null;
        if (input.startAt && input.endAt) {
          minutes = Math.round((input.endAt.getTime() - input.startAt.getTime()) / MS_PER_MINUTE);
        }
        if (minutes == null || minutes <= 0 || minutes > MAX_SLEEP_MINUTES) {
          throw new BadRequestException('睡眠時間不對（要有幾點睡幾點起，或睡了多久）');
        }
        return {
          ...base,
          date: input.date ? dateKey(input.date) : dateKey(input.endAt ? taipeiDateKey(input.endAt) : undefined),
          startAt: input.startAt ?? null,
          endAt: input.endAt ?? null,
          minutes,
          value: null,
          activity: null,
        };
      }
      case HealthRecordType.EXERCISE:
        if (!input.activity?.trim() && !input.minutes) throw new BadRequestException('運動要有項目或時間');
        return { ...base, date: dateKey(input.date), startAt: null, endAt: null, minutes: input.minutes ?? null, value: input.value ?? null, activity: input.activity?.trim() || '運動' };
      case HealthRecordType.WEIGHT:
        if (!input.value || input.value < 20 || input.value > 300) throw new BadRequestException('體重要是 20～300 公斤');
        return { ...base, date: dateKey(input.date), startAt: null, endAt: null, minutes: null, value: Math.round(input.value * 10) / 10, activity: null };
      case HealthRecordType.STEPS:
        if (input.value == null || input.value < 0) throw new BadRequestException('步數不對');
        return { ...base, date: dateKey(input.date), startAt: null, endAt: null, minutes: null, value: Math.round(input.value), activity: null };
    }
  }

  /** 回顧/早報/AI 用：`start`/`end` 是 date-only key，end 不含。 */
  async stats(userId: string, start: Date, end: Date) {
    const records = await this.prisma.healthRecord.findMany({
      where: { ownerUserId: userId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
    const sleeps = records.filter((r) => r.type === HealthRecordType.SLEEP && r.minutes != null);
    const exercises = records.filter((r) => r.type === HealthRecordType.EXERCISE);
    const weights = records.filter((r) => r.type === HealthRecordType.WEIGHT && r.value != null);
    const steps = records.filter((r) => r.type === HealthRecordType.STEPS && r.value != null);
    const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    const activityCount = new Map<string, number>();
    for (const e of exercises) activityCount.set(e.activity ?? '運動', (activityCount.get(e.activity ?? '運動') ?? 0) + 1);
    const avgSleep = avg(sleeps.map((s) => s.minutes!));
    const avgSteps = avg(steps.map((s) => s.value!));

    return {
      sleep: {
        nights: sleeps.length,
        averageMinutes: avgSleep != null ? Math.round(avgSleep) : null,
        shortNights: sleeps.filter((s) => s.minutes! < SHORT_SLEEP_MINUTES).length,
      },
      exercise: {
        sessions: exercises.length,
        totalMinutes: exercises.reduce((a, e) => a + (e.minutes ?? 0), 0),
        activities: [...activityCount.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      },
      weight:
        weights.length > 0
          ? { first: weights[0].value!, last: weights[weights.length - 1].value!, change: Math.round((weights[weights.length - 1].value! - weights[0].value!) * 10) / 10 }
          : null,
      steps: { days: steps.length, average: avgSteps != null ? Math.round(avgSteps) : null },
    };
  }

  /** Last `days` days including today (Taipei). */
  statsLastDays(userId: string, days: number) {
    const n = Math.min(Math.max(Math.round(days), 1), 366);
    const end = new Date(dateKey(undefined).getTime() + MS_PER_DAY);
    return this.stats(userId, new Date(end.getTime() - n * MS_PER_DAY), end);
  }

  /** Most recent finished nights, newest first — for the morning brief. */
  recentSleeps(userId: string, take: number) {
    return this.prisma.healthRecord.findMany({
      where: { ownerUserId: userId, type: HealthRecordType.SLEEP, minutes: { not: null } },
      orderBy: { date: 'desc' },
      take,
    });
  }

  // --- iPhone 捷徑 ---

  async getIngestToken(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { healthIngestToken: true } });
    return { token: user.healthIngestToken ?? (await this.regenerateIngestToken(userId)).token };
  }

  async regenerateIngestToken(userId: string) {
    const token = randomBytes(24).toString('base64url');
    await this.prisma.user.update({ where: { id: userId }, data: { healthIngestToken: token } });
    return { token };
  }

  /** POST /health/ingest from the 捷徑. Returns a sentence the 捷徑 can show. Accepted fields
   * (all optional, any mix):
   * - event: "sleep"（去睡覺）/ "wake"（起床）— 用「睡眠」自動化觸發，系統自己配對成一晚
   * - sleepStart / sleepEnd: 健康 App 睡眠樣本的開始/結束時間（一個或一串）
   * - sleepHours / sleepMinutes: 直接給睡多久
   * - steps, weight, exerciseMinutes, date (YYYY-MM-DD) */
  async ingest(token: string | undefined, body: Record<string, unknown>, now = new Date()): Promise<{ ok: true; message: string }> {
    if (!token) throw new UnauthorizedException('缺少金鑰');
    const user = await this.prisma.user.findUnique({ where: { healthIngestToken: token }, select: { id: true } });
    if (!user) throw new UnauthorizedException('金鑰不對，請到 App 的「健康」重新複製網址');
    const userId = user.id;
    const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.date) ? body.date.slice(0, 10) : taipeiDateKey(now);
    const done: string[] = [];

    const event = typeof body.event === 'string' ? body.event.trim().toLowerCase() : '';
    if (event === 'sleep' || event === '睡覺') {
      await this.openSleep(userId, now);
      done.push('晚安！已記下睡覺時間');
    } else if (event === 'wake' || event === '起床') {
      const night = await this.closeSleep(userId, now);
      done.push(
        night === 'test'
          ? '測試成功！（離「睡覺」不到 30 分鐘，這次不記）'
          : night
            ? `早安！昨晚睡了 ${formatMinutes(night.minutes!)}`
            : '早安！（沒找到昨晚的睡覺時間，這次沒記）',
      );
    }

    const span = sleepSpan(parseInstantList(body.sleepStart), parseInstantList(body.sleepEnd));
    const sleepHours = parseNumber(body.sleepHours);
    const sleepMinutes = parseNumber(body.sleepMinutes) ?? (sleepHours != null ? Math.round(sleepHours * 60) : null);
    if (span || (sleepMinutes != null && sleepMinutes > 0)) {
      const sleepDate = span ? taipeiDateKey(span.endAt) : date;
      const minutes = sleepMinutes != null && sleepMinutes > 0 && sleepMinutes <= MAX_SLEEP_MINUTES ? sleepMinutes : span!.minutes;
      await this.upsertShortcut(userId, `sleep:${sleepDate}`, {
        type: HealthRecordType.SLEEP,
        date: sleepDate,
        startAt: span?.startAt,
        endAt: span?.endAt,
        minutes,
      });
      done.push(`睡眠 ${formatMinutes(minutes)}`);
    }

    const steps = parseNumber(body.steps);
    if (steps != null && steps >= 0) {
      await this.upsertShortcut(userId, `steps:${date}`, { type: HealthRecordType.STEPS, date, value: steps });
      done.push(`步數 ${Math.round(steps).toLocaleString('en-US')}`);
    }
    const weight = parseNumber(body.weight);
    if (weight != null && weight > 0) {
      await this.upsertShortcut(userId, `weight:${date}`, { type: HealthRecordType.WEIGHT, date, value: weight });
      done.push(`體重 ${Math.round(weight * 10) / 10} 公斤`);
    }
    const exerciseMinutes = parseNumber(body.exerciseMinutes);
    if (exerciseMinutes != null && exerciseMinutes > 0) {
      await this.upsertShortcut(userId, `exercise:${date}`, { type: HealthRecordType.EXERCISE, date, minutes: Math.round(exerciseMinutes), activity: '運動（健康 App）' });
      done.push(`運動 ${Math.round(exerciseMinutes)} 分鐘`);
    }

    if (done.length === 0) return { ok: true, message: '沒有收到可以記錄的資料（睡眠、步數或體重）' };
    return { ok: true, message: event ? done.join('；') : `已記錄：${done.join('、')}` };
  }

  /** Re-sent data for the same day replaces the earlier upload instead of piling up. */
  private async upsertShortcut(userId: string, key: string, input: HealthRecordInput) {
    const externalKey = `shortcut:${key}`;
    const data = this.normalize(input);
    await this.prisma.healthRecord.upsert({
      where: { ownerUserId_externalKey: { ownerUserId: userId, externalKey } },
      create: { ownerUserId: userId, source: 'SHORTCUT', externalKey, ...data },
      update: data,
    });
  }

  /** 「睡覺」event: an open SLEEP row (startAt only); re-triggering just moves the start. */
  private async openSleep(userId: string, now: Date) {
    // A 「睡覺」that never got its 「起床」is stale after one night.
    await this.prisma.healthRecord.deleteMany({
      where: {
        ownerUserId: userId,
        type: HealthRecordType.SLEEP,
        endAt: null,
        minutes: null,
        startAt: { lt: new Date(now.getTime() - MAX_SLEEP_MINUTES * MS_PER_MINUTE) },
      },
    });
    const open = await this.findOpenSleep(userId, now);
    if (open) {
      await this.prisma.healthRecord.update({ where: { id: open.id }, data: { startAt: now } });
      return;
    }
    await this.prisma.healthRecord.create({
      data: { ownerUserId: userId, type: HealthRecordType.SLEEP, date: dateKey(taipeiDateKey(now)), startAt: now, source: 'SHORTCUT' },
    });
  }

  /** 「起床」event closes the night opened by 「睡覺」. */
  private async closeSleep(userId: string, now: Date): Promise<HealthRecord | 'test' | null> {
    const open = await this.findOpenSleep(userId, now);
    if (!open) return null;
    const minutes = Math.round((now.getTime() - open.startAt!.getTime()) / MS_PER_MINUTE);
    if (minutes < MIN_NIGHT_MINUTES) {
      await this.prisma.healthRecord.delete({ where: { id: open.id } });
      return 'test';
    }
    const wakeDate = taipeiDateKey(now);
    const externalKey = `shortcut:sleep:${wakeDate}`;
    // Same night already uploaded from 健康 App samples → keep only this one.
    await this.prisma.healthRecord.deleteMany({ where: { ownerUserId: userId, externalKey, id: { not: open.id } } });
    return this.prisma.healthRecord.update({
      where: { id: open.id },
      data: { endAt: now, minutes, date: dateKey(wakeDate), externalKey },
    });
  }

  private findOpenSleep(userId: string, now: Date) {
    return this.prisma.healthRecord.findFirst({
      where: {
        ownerUserId: userId,
        type: HealthRecordType.SLEEP,
        endAt: null,
        startAt: { gte: new Date(now.getTime() - MAX_SLEEP_MINUTES * MS_PER_MINUTE), lte: now },
        minutes: null,
      },
      orderBy: { startAt: 'desc' },
    });
  }

  private async getOwn(userId: string, id: string) {
    const record = await this.prisma.healthRecord.findFirst({ where: { id, ownerUserId: userId } });
    if (!record) throw new NotFoundException('找不到這筆健康紀錄');
    return record;
  }
}

/** For AI/LINE text: one record as a short line. */
export function describeHealthRecord(r: HealthRecord): string {
  const day = utcDateKey(r.date);
  switch (r.type) {
    case HealthRecordType.SLEEP:
      return r.minutes != null ? `${day} 睡眠 ${formatMinutes(r.minutes)}` : `${day} 睡眠（還沒起床）`;
    case HealthRecordType.EXERCISE:
      return `${day} ${r.activity ?? '運動'}${r.minutes ? ` ${r.minutes} 分鐘` : ''}`;
    case HealthRecordType.WEIGHT:
      return `${day} 體重 ${r.value} 公斤`;
    case HealthRecordType.STEPS:
      return `${day} 步數 ${Math.round(r.value ?? 0).toLocaleString('en-US')}`;
  }
}
