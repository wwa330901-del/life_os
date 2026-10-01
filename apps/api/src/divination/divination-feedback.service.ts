import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Ask once the thing asked about has had time to happen. */
const ASK_AFTER_DAYS = 7;
/** Older readings than this aren't worth asking about any more. */
const ASK_UNTIL_DAYS = 30;
/** Replies within this window after the question go to the AI as feedback. */
export const DIVINATION_FEEDBACK_WINDOW_MS = MS_PER_DAY;

/** 算命回饋（2026-10-01）：算完 7 天後 LINE 問一次「後來怎樣？準不準？」，
 * 一天最多問一筆（最舊的那筆）。回覆由萬用 AI 記成回饋（record_divination_feedback）。 */
@Injectable()
export class DivinationFeedbackService {
  private readonly logger = new Logger(DivinationFeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  @Cron('30 19 * * *', { timeZone: 'Asia/Taipei' })
  async askForFeedback(now = new Date()) {
    const records = await this.prisma.divinationRecord.findMany({
      where: {
        accuracy: null,
        feedbackAskedAt: null,
        castAt: { lte: new Date(now.getTime() - ASK_AFTER_DAYS * MS_PER_DAY), gte: new Date(now.getTime() - ASK_UNTIL_DAYS * MS_PER_DAY) },
        owner: { lineAccountLink: { is: { lineUserId: { not: null } } } },
      },
      orderBy: { castAt: 'asc' },
    });
    const asked = new Set<string>();
    for (const record of records) {
      if (asked.has(record.ownerUserId)) continue;
      asked.add(record.ownerUserId);
      try {
        const days = Math.round((now.getTime() - record.castAt.getTime()) / MS_PER_DAY);
        const conclusion = record.interpretation.split('\n')[0].replace(/^1[.、]\s*/, '').slice(0, 80);
        await this.lineNotifier.notifyByUser(
          record.ownerUserId,
          [
            `🔮 ${days} 天前你算了「${record.question}」（${record.hexagram}）`,
            `當時說：${conclusion}`,
            '',
            '後來結果怎樣？回我「準」「部分準」或「不準」，也可以多講幾句發生了什麼，之後解卦會參考。',
          ].join('\n'),
        );
        await this.prisma.divinationRecord.update({ where: { id: record.id }, data: { feedbackAskedAt: now } });
        await this.prisma.lineAccountLink.update({
          where: { userId: record.ownerUserId },
          data: { divinationFeedbackId: record.id, divinationFeedbackAt: now },
        });
      } catch (error) {
        this.logger.error(`算命回饋詢問失敗（recordId=${record.id}）`, error as Error);
      }
    }
  }
}
