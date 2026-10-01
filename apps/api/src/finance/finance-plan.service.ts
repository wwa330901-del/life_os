import { decryptSecret } from '../common/secret-box';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceTransactionsService } from './finance-transactions.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceRecurringTransactionsService } from './finance-recurring-transactions.service';
import { FinanceHealthService } from './finance-health.service';
import { AiUsageService } from '../knowledge/ai-usage.service';
import { WishlistService } from './wishlist.service';
import { GEMINI_MODEL } from '../knowledge/ai/gemini-content-analysis.service';
import { taipeiCurrentMonth } from '../common/taipei-date';
import { AiUsageStatus, FinanceCategoryKind, FinanceTransactionType, Prisma } from '../../generated/prisma/client.js';
import { FINANCE_PLAN_SCHEMA, financePlanText, parseFinancePlan, type FinancePlanResult } from './finance-plan-format';

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

const round = (n: number) => Math.round(n);

/** 理財評估（2026-10-01）：固定薪資＝每月定期收入（FinanceRecurringTransaction，
 * 設一次就每個月自動入帳），加上固定支出、近 3 個月各分類平均花費、財務健檢，
 * 交給 AI 給分配建議跟預算推薦。 */
@Injectable()
export class FinancePlanService {
  private readonly logger = new Logger(FinancePlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: FinanceTransactionsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly recurring: FinanceRecurringTransactionsService,
    private readonly health: FinanceHealthService,
    private readonly aiUsage: AiUsageService,
    private readonly wishlist: WishlistService,
  ) {}

  async spaceIdOf(userId: string): Promise<string> {
    const space = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!space) throw new BadRequestException('找不到個人空間，請先登入 App 一次');
    return space.id;
  }

  /** Everything the plan is based on — also what the AI tool returns. */
  async inputs(userId: string) {
    const spaceId = await this.spaceIdOf(userId);
    const month = taipeiCurrentMonth();
    const months = [1, 2, 3].map((d) => shiftMonth(month, -d));
    const [recurring, summaries, budgets, health, categories] = await Promise.all([
      this.prisma.financeRecurringTransaction.findMany({ where: { spaceId, active: true }, include: { category: true } }),
      Promise.all(months.map((m) => this.transactions.monthlySummary(userId, spaceId, m))),
      this.budgets.list(userId, spaceId),
      this.health.forSpace(userId, spaceId),
      this.prisma.financeCategory.findMany({ where: { spaceId, kind: FinanceCategoryKind.EXPENSE, parentId: null } }),
    ]);

    const fixedIncome = recurring
      .filter((r) => r.type === FinanceTransactionType.INCOME && r.amount != null)
      .map((r) => ({ name: r.category?.name ?? r.note ?? '固定收入', amount: r.amount!, dayOfMonth: r.dayOfMonth }));
    const fixedExpenses = recurring
      .filter((r) => r.type === FinanceTransactionType.EXPENSE && r.amount != null)
      .map((r) => ({ name: r.category?.name ?? r.note ?? '固定支出', amount: r.amount!, dayOfMonth: r.dayOfMonth }));

    const byCategory = new Map<string, number>();
    for (const s of summaries) {
      for (const c of s.byCategory) {
        if (c.kind !== FinanceTransactionType.EXPENSE) continue;
        byCategory.set(c.name, (byCategory.get(c.name) ?? 0) + c.total);
      }
    }
    const budgetByName = new Map(budgets.map((b) => [b.category.name, b.monthlyAmount]));

    return {
      fixedMonthlyIncome: round(fixedIncome.reduce((sum, r) => sum + r.amount, 0)),
      fixedIncome,
      fixedMonthlyExpenses: round(fixedExpenses.reduce((sum, r) => sum + r.amount, 0)),
      fixedExpenses,
      averageMonthlyIncome: round(summaries.reduce((sum, s) => sum + s.totalIncome, 0) / 3),
      averageMonthlyExpense: round(summaries.reduce((sum, s) => sum + s.totalExpense, 0) / 3),
      categoryAverages: [...byCategory.entries()]
        .map(([name, total]) => ({ name, monthlyAverage: round(total / 3), currentBudget: budgetByName.get(name) ?? null }))
        .sort((a, b) => b.monthlyAverage - a.monthlyAverage),
      /** 可以設預算的母分類名稱 */
      budgetableCategories: categories.map((c) => c.name),
      health: { total: health.total, grade: health.grade, items: health.items.map((i) => ({ label: i.label, score: i.score, max: i.max, detail: i.detail })) },
      netWorth: round(health.netWorth),
      /** 購物車：想買的東西、每月撥多少、大概哪個月買得起。 */
      wishlist: await this.wishlistSummary(userId),
    };
  }

  private async wishlistSummary(userId: string) {
    const o = await this.wishlist.overview(userId);
    return {
      monthlyBudget: o.monthlyBudget,
      total: o.total,
      items: o.items.map((i) => ({ name: i.name, price: i.price, priority: i.priority, targetDate: i.targetDate, affordableMonth: i.affordableMonth })),
    };
  }

  /** 一次產生整份理財評估（LINE「理財評估」、App 財務報表的按鈕）。 */
  /** 產生財務規劃（結構化），存起來給 App「規劃」分頁和 LINE「套用預算」用。
   * `plan` 是轉好的文字（LINE、舊版 App 用）。 */
  async generate(userId: string): Promise<{ plan: string; hasFixedIncome: boolean; structured: FinancePlanResult }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { geminiApiKey: true } });
    const apiKey = decryptSecret(user.geminiApiKey);
    if (!apiKey) throw new BadRequestException('理財評估需要 AI，請先到 App 左側「AI 設定」貼上你的 Gemini 金鑰');
    const data = await this.inputs(userId);
    const income = data.fixedMonthlyIncome || data.averageMonthlyIncome;

    const prompt = [
      '你是專業、務實的個人理財顧問。依下面這位使用者的真實數據（JSON，金額是新台幣）做理財評估與建議。',
      data.fixedMonthlyIncome > 0
        ? `他的固定月收入是 ${data.fixedMonthlyIncome} 元。`
        : `他還沒設定固定薪資，先用近 3 個月平均收入 ${data.averageMonthlyIncome} 元估算。`,
      JSON.stringify(data),
      '',
      '',
      '用繁體中文，回傳 JSON（每個文字欄位簡短、講具體數字、不要 Markdown 符號）：',
      '- summary：現況 2～3 句——收入、固定支出、平均花費、每月大概能存多少；財務健檢分數與最弱的一項。' + (data.fixedMonthlyIncome > 0 ? '' : '最後提醒他可以設定固定薪資，評估會更準。'),
      `- allocation：把每月 ${income} 元分成 固定支出／生活費／儲蓄（預備金）／投資${data.wishlist.items.length ? '／購物車' : ''}，每項 name、amount（元）、percent、reason（一句理由；可參考 50/30/20，但要依他的實際狀況調整）。amount 加起來等於 ${income}。`,
      `- budgets：挑 3～5 個花費最多的分類建議每月預算（比現在平均少一點但做得到），category 一定要是 budgetableCategories 裡的名稱，amount 是元，reason 一句。`,
      '- steps：接下來 3 步，依優先順序的具體行動（例如先把預備金存到多少、每月定期定額多少、哪個分類要控制）。',
      ...(data.wishlist.items.length
        ? ['- wishlistAdvice：購物車（wishlist）的建議 1～2 句——每月撥多少買東西、哪樣先買、哪樣可以等，用 affordableMonth 講大概幾月買得起；預備金不夠時先顧預備金。']
        : []),
    ].join('\n');

    const startedAt = Date.now();
    try {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create({
        model: GEMINI_MODEL,
        input: prompt,
        response_format: { type: 'text', mime_type: 'application/json', schema: FINANCE_PLAN_SCHEMA },
      });
      await this.aiUsage.record({
        userId,
        feature: 'finance_plan',
        model: GEMINI_MODEL,
        inputTokens: interaction.usage?.total_input_tokens ?? 0,
        outputTokens: interaction.usage?.total_output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.SUCCESS,
      });
      const raw = interaction.output_text?.trim();
      if (!raw) throw new Error('AI 沒有回應');
      const structured = parseFinancePlan(raw, { monthlyIncome: income, budgetableCategories: data.budgetableCategories, categoryAverages: data.categoryAverages });
      const spaceId = await this.spaceIdOf(userId);
      await this.prisma.space.update({
        where: { id: spaceId },
        data: { financePlan: structured as unknown as Prisma.InputJsonValue, financePlanAt: new Date() },
      });
      return { plan: financePlanText(structured), hasFixedIncome: data.fixedMonthlyIncome > 0, structured };
    } catch (error) {
      await this.aiUsage.record({
        userId,
        feature: 'finance_plan',
        model: GEMINI_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: Date.now() - startedAt,
        status: AiUsageStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(`理財評估失敗（userId=${userId}）：${String(error)}`);
      throw new BadRequestException('理財評估產生失敗，請稍後再試一次');
    }
  }

  /** 固定薪資：沒有就新增一筆每月定期收入，有就更新金額/日期/帳戶。 */
  async setFixedIncome(userId: string, input: { amount: number; dayOfMonth: number; accountName?: string; categoryName?: string }) {
    if (!(input.amount > 0)) throw new BadRequestException('薪資要大於 0');
    if (!(input.dayOfMonth >= 1 && input.dayOfMonth <= 31)) throw new BadRequestException('發薪日要是 1～31');
    const spaceId = await this.spaceIdOf(userId);
    const [accounts, categories, existing] = await Promise.all([
      this.prisma.financeAccount.findMany({ where: { spaceId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.financeCategory.findMany({ where: { spaceId, kind: FinanceCategoryKind.INCOME } }),
      this.prisma.financeRecurringTransaction.findMany({
        where: { spaceId, type: FinanceTransactionType.INCOME, active: true },
        include: { category: true },
      }),
    ]);
    if (accounts.length === 0) throw new BadRequestException('還沒有帳戶，請先到 App 的記帳新增帳戶');
    const wantedAccount = input.accountName?.trim();
    const account = wantedAccount
      ? (accounts.find((a) => a.name === wantedAccount) ?? accounts.find((a) => a.name.includes(wantedAccount)))
      : (accounts.find((a) => a.type === 'BANK') ?? accounts[0]);
    if (!account) throw new BadRequestException(`沒有「${wantedAccount}」這個帳戶，可用的：${accounts.map((a) => a.name).join('、')}`);
    const wantedCategory = input.categoryName?.trim() || '薪';
    const category = categories.find((c) => c.name.includes(wantedCategory)) ?? categories[0];
    if (!category) throw new BadRequestException('還沒有收入分類，請先到 App 新增一個（例如「薪水」）');

    const salary = existing.find((r) => r.categoryId === category.id) ?? existing.find((r) => r.category?.name.includes('薪'));
    const dto = { amount: input.amount, dayOfMonth: input.dayOfMonth, accountId: account.id, categoryId: category.id };
    const saved = salary
      ? await this.recurring.update(userId, spaceId, salary.id, dto)
      : await this.recurring.create(userId, spaceId, { type: FinanceTransactionType.INCOME, note: '固定薪資', ...dto });
    return { amount: saved.amount, dayOfMonth: saved.dayOfMonth, account: account.name, category: category.name, updated: salary != null };
  }

  /** 依名稱設多個分類的每月預算。 */
  /** 最近一次的財務規劃（沒做過就 null）。 */
  async latest(userId: string): Promise<FinancePlanResult | null> {
    const spaceId = await this.spaceIdOf(userId);
    const space = await this.prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { financePlan: true } });
    return (space.financePlan as unknown as FinancePlanResult | null) ?? null;
  }

  /** 套用最近一次規劃的建議預算（App 按鈕、LINE「套用預算」）。 */
  async applyLatestBudgets(userId: string): Promise<string[]> {
    const plan = await this.latest(userId);
    if (!plan || plan.budgets.length === 0) throw new BadRequestException('還沒有可以套用的預算建議，先做一次理財評估');
    return this.applyBudgets(userId, plan.budgets.map((b) => ({ categoryName: b.category, monthlyAmount: b.amount })));
  }

  async applyBudgets(userId: string, items: Array<{ categoryName: string; monthlyAmount: number }>) {
    const spaceId = await this.spaceIdOf(userId);
    const categories = await this.prisma.financeCategory.findMany({ where: { spaceId, kind: FinanceCategoryKind.EXPENSE } });
    const results: string[] = [];
    for (const item of items) {
      const category = categories.find((c) => c.name === item.categoryName) ?? categories.find((c) => c.name.includes(item.categoryName));
      if (!category || !(item.monthlyAmount > 0)) continue;
      await this.budgets.upsert(userId, spaceId, { categoryId: category.id, monthlyAmount: Math.round(item.monthlyAmount) });
      results.push(`${category.name} ${Math.round(item.monthlyAmount).toLocaleString('en-US')}`);
    }
    return results;
  }
}
