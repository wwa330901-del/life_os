import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { AiUsageStatus, Prisma } from '../../generated/prisma/client.js';
import { birthChart, castByTime, MeihuaReading } from './meihua';

const HISTORY_LIMIT = 30;
/** How many past readings with feedback the interpreter gets to calibrate on. */
const FEEDBACK_CONTEXT = 5;

export const ACCURACY_LABEL: Record<number, string> = { 3: '準', 2: '部分準', 1: '不準' };

export function formatReading(r: MeihuaReading): string {
  return [
    `起卦時間：${r.lunarDate}`,
    `本卦：${r.original.name}（上${r.original.upper}、下${r.original.lower}），第 ${r.movingLine} 爻動`,
    `互卦：${r.mutual.name}　變卦：${r.changed.name}`,
    `體卦 ${r.ti.trigram}（${r.ti.element}）、用卦 ${r.yong.trigram}（${r.yong.element}）：${r.relation}`,
    `體卦在${r.season.monthBranch}月：${r.season.tiStrength}`,
  ].join('\n');
}

/** 梅花易數 (2026-10-01). The cast is pure rules (`meihua.ts`); Gemini only
 * interprets it for the user's question, using their own key. */
@Injectable()
export class DivinationService {
  private readonly logger = new Logger(DivinationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AiUsageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { birthDate: true, birthTime: true } });
    const birthDate = user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null;
    return {
      birthDate,
      birthTime: user.birthTime,
      chart: birthDate ? birthChart(birthDate, user.birthTime) : null,
    };
  }

  async setProfile(userId: string, birthDate: string, birthTime: string | null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new BadRequestException('出生日期格式要是 YYYY-MM-DD');
    if (birthTime && !/^\d{1,2}:\d{2}$/.test(birthTime)) throw new BadRequestException('出生時間格式要是 HH:mm');
    await this.prisma.user.update({
      where: { id: userId },
      data: { birthDate: new Date(`${birthDate}T00:00:00Z`), birthTime: birthTime || null },
    });
    return this.getProfile(userId);
  }

  list(userId: string) {
    return this.prisma.divinationRecord.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.divinationRecord.deleteMany({ where: { id, ownerUserId: userId } });
    return { deleted: true };
  }

  /** 準不準：3＝準、2＝部分準、1＝不準。Also ends any LINE「準不準？」question about it. */
  async setFeedback(userId: string, id: string, accuracy: number, feedback?: string | null) {
    if (![1, 2, 3].includes(accuracy)) throw new BadRequestException('準不準要是 1～3');
    const record = await this.prisma.divinationRecord.findFirst({ where: { id, ownerUserId: userId } });
    if (!record) throw new BadRequestException('找不到這筆算命紀錄');
    await this.prisma.lineAccountLink.updateMany({
      where: { userId, divinationFeedbackId: id },
      data: { divinationFeedbackId: null, divinationFeedbackAt: null },
    });
    return this.prisma.divinationRecord.update({
      where: { id },
      data: { accuracy, feedback: feedback?.trim() || null, feedbackAt: new Date() },
    });
  }

  /** 回饋過幾次、各幾次。 */
  async feedbackStats(userId: string) {
    const groups = await this.prisma.divinationRecord.groupBy({
      by: ['accuracy'],
      where: { ownerUserId: userId, accuracy: { not: null } },
      _count: true,
    });
    const count = (a: number) => groups.find((g) => g.accuracy === a)?._count ?? 0;
    const total = count(1) + count(2) + count(3);
    return { total, accurate: count(3), partly: count(2), inaccurate: count(1) };
  }

  /** 用現在的時間起卦並解卦。 */
  async cast(userId: string, question: string, now = new Date()) {
    const q = question.trim();
    if (!q) throw new BadRequestException('要先說想算什麼');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { geminiApiKey: true, birthDate: true, birthTime: true },
    });
    if (!user.geminiApiKey) {
      throw new BadRequestException('解卦需要 AI，請先到 App 左側「AI 設定」貼上你的 Gemini 金鑰');
    }

    const reading = castByTime(now);
    const chart = user.birthDate ? birthChart(user.birthDate.toISOString().slice(0, 10), user.birthTime) : null;
    const past = await this.prisma.divinationRecord.findMany({
      where: { ownerUserId: userId, accuracy: { not: null } },
      orderBy: { feedbackAt: 'desc' },
      take: FEEDBACK_CONTEXT,
    });
    const interpretation = await this.interpret(userId, user.geminiApiKey, q, reading, chart, past);

    return this.prisma.divinationRecord.create({
      data: {
        ownerUserId: userId,
        question: q,
        castAt: now,
        hexagram: reading.original.name,
        reading: reading as unknown as Prisma.InputJsonValue,
        interpretation,
      },
    });
  }

  private async interpret(
    userId: string,
    apiKey: string,
    question: string,
    reading: MeihuaReading,
    chart: ReturnType<typeof birthChart> | null,
    past: Array<{ question: string; hexagram: string; interpretation: string; accuracy: number | null; feedback: string | null }> = [],
  ): Promise<string> {
    const prompt = [
      '你是精通梅花易數的老師。以下卦象是依「年月日時起卦法」用問事當下的時間算出來的，請針對問題解卦。',
      `問題：${question}`,
      formatReading(reading),
      chart
        ? `問卦人：農曆生日 ${chart.lunarBirthday}，生肖${chart.zodiac}，八字 ${chart.pillars}，日主 ${chart.dayMaster}`
        : '問卦人沒有提供生辰。',
      '',
      ...(past.length > 0
        ? [
            '',
            '這個人過去算過、事後回報準不準（參考哪種判斷方式對他比較準，但這次仍以這次卦象為主）：',
            ...past.map(
              (p) =>
                `- 問「${p.question}」得${p.hexagram}，當時結論：${p.interpretation.split('\n')[0].slice(0, 60)} → 事後：${ACCURACY_LABEL[p.accuracy ?? 0] ?? '?'}${p.feedback ? `（${p.feedback.slice(0, 60)}）` : ''}`,
            ),
          ]
        : []),
      '',
      '解卦方式：以體用生剋為主、參考體卦旺衰；本卦看現況、互卦看過程、變卦看結果；可引用本卦卦辭與動爻爻辭的意思。',
      '回答格式（繁體中文、不要用 Markdown 符號、300 字以內）：',
      '1. 一句話結論（吉／小吉／平／小凶／凶，並直接回答問題）',
      '2. 卦象說明（為什麼這樣判斷，白話解釋）',
      '3. 建議（具體可以怎麼做、要注意什麼、時機）',
      '最後加一句：卦象僅供參考，決定還是在你自己。',
    ].join('\n');

    const startedAt = Date.now();
    try {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create({ model: GEMINI_MODEL, input: prompt });
      await this.aiUsage.record({
        userId,
        feature: 'divination',
        model: GEMINI_MODEL,
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens: interaction.usage?.total_output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      const text = interaction.output_text?.trim();
      if (!text) throw new Error('AI 沒有回應');
      return text;
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'divination',
        model: GEMINI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`解卦失敗（userId=${userId}）：${String(error)}`);
      throw new BadRequestException('解卦失敗，請稍後再試一次');
    }
  }
}
