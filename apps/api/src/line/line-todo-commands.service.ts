import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TodosService } from '../todos/todos.service';
import { LifeGoalsService } from '../life-goals/life-goals.service';
import { formatGoalProgress } from '../life-goals/life-goal-reminder.service';
import { LifeGoalStatus } from '../../generated/prisma/client.js';
import type { LineAccountLink } from '../../generated/prisma/client.js';
import { taipeiTodayRange, taipeiWallClockToUtc, formatTaipeiDateTime } from '../common/taipei-date';
import { dateToPickerValue, parseSnoozeTime, pickerValueToDate } from './snooze-time';
import { LineReplyService } from './line-reply.service';
import { SNOOZE_REPLY_WINDOW_MS, Responder, LEADING_SEPARATORS, EDGE_SEPARATORS } from './line-shared';

/** LINE 代辦：提醒按鈕（完成／延後）、新增、完成、改期、代辦總覽、人生目標。 */
@Injectable()
export class LineTodoCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly todosService: TodosService,
    private readonly lifeGoalsService: LifeGoalsService,
    private readonly out: LineReplyService,
  ) {}

  async handleTodoPostback(link: LineAccountLink, data: string, replyToken: string, pickedDatetime?: string) {
    const [, action, todoId, minutesRaw] = data.split(':');
    const userId = link.userId;
    const todo = await this.prisma.projectTodo.findUnique({ where: { id: todoId } });
    if (!todo || todo.personalOwnerUserId !== userId) {
      await this.out.reply(replyToken, '這件代辦已經刪掉了。');
      return;
    }
    if (todo.done) {
      await this.out.reply(replyToken, `「${todo.title}」已經完成了 👍`);
      return;
    }
    if (action === 'done') {
      await this.todosService.update(userId, todo.id, { done: true });
      await this.out.reply(replyToken, `👍 「${todo.title}」完成，已打勾。`);
      return;
    }
    if (action === 'snooze-at') {
      const at = pickedDatetime ? pickerValueToDate(pickedDatetime) : null;
      if (!at || at <= new Date()) {
        await this.out.reply(replyToken, '那個時間已經過了，再選一次或直接打時間。');
        return;
      }
      await this.snoozeTodo(link.id, todo, at, replyToken);
      return;
    }
    if (action === 'snooze') {
      // 新版提醒沒帶分鐘，先問要延到什麼時候；舊訊息上的「10 分鐘後」「1 小時後」照舊。
      if (minutesRaw) {
        const minutes = Math.min(24 * 60, Math.max(1, Number(minutesRaw) || 10));
        await this.snoozeTodo(link.id, todo, new Date(Date.now() + minutes * 60 * 1000), replyToken);
        return;
      }
      await this.prisma.lineAccountLink.update({
        where: { id: link.id },
        data: { pendingSnoozeTodoId: todo.id, pendingSnoozeAt: new Date() },
      });
      const now = Date.now();
      await this.out.callReplyApi({
        replyToken,
        messages: [
          {
            type: 'text',
            text: `「${todo.title}」要延到什麼時候？\n直接打就好，例如：30分、2小時、15:30、下午3點、明天9點`,
            quickReply: {
              items: [
                {
                  type: 'action',
                  action: {
                    type: 'datetimepicker',
                    label: '📅 選時間',
                    data: `todo:snooze-at:${todo.id}`,
                    mode: 'datetime',
                    initial: dateToPickerValue(new Date(now + 60 * 60 * 1000)),
                    min: dateToPickerValue(new Date(now)),
                  },
                },
              ],
            },
          },
        ],
      });
    }
  }

  async snoozeTodo(linkId: string, todo: { id: string; title: string }, at: Date, replyToken: string) {
    await this.prisma.projectTodo.update({ where: { id: todo.id }, data: { remindAt: at } });
    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { pendingSnoozeTodoId: null, pendingSnoozeAt: null },
    });
    await this.out.reply(replyToken, `好，${formatTaipeiDateTime(at, false)} 再提醒你「${todo.title}」。`);
  }

  /** 直接回覆某則提醒：「做完了」打勾、「下午3點」延後，不用花 AI。其他的話
   * 回 false，交給 AI（它會看到引用的提醒內容）。 */
  async tryHandleQuotedReminder(link: LineAccountLink, todoId: string, text: string, replyToken: string): Promise<boolean> {
    if (/^(已?完成|做完|弄好|處理好|搞定|好了)了?[囉啦喔！!。~～]*$/i.test(text)) {
      await this.handleTodoPostback(link, `todo:done:${todoId}`, replyToken);
      return true;
    }
    if (text === '延後' || text === '晚點') {
      await this.handleTodoPostback(link, `todo:snooze:${todoId}`, replyToken);
      return true;
    }
    const at = parseSnoozeTime(text, new Date());
    if (!at) return false;
    const todo = await this.prisma.projectTodo.findFirst({ where: { id: todoId, personalOwnerUserId: link.userId, done: false } });
    if (!todo) return false;
    await this.snoozeTodo(link.id, todo, at, replyToken);
    return true;
  }

  /** 按了「延後」之後打的時間。打的不是時間、或隔太久才打，就回 false，
   * 那句話照一般訊息處理，不會卡住。 */
  async tryResolveSnooze(link: LineAccountLink, text: string, replyToken: string): Promise<boolean> {
    const fresh = !!link.pendingSnoozeAt && Date.now() - link.pendingSnoozeAt.getTime() < SNOOZE_REPLY_WINDOW_MS;
    const cancelled = fresh && text === '取消';
    const at = fresh && !cancelled ? parseSnoozeTime(text, new Date()) : null;
    const todo = at
      ? await this.prisma.projectTodo.findFirst({
          where: { id: link.pendingSnoozeTodoId!, personalOwnerUserId: link.userId, done: false },
        })
      : null;
    if (at && todo) {
      await this.snoozeTodo(link.id, todo, at, replyToken);
      return true;
    }
    await this.prisma.lineAccountLink.update({
      where: { id: link.id },
      data: { pendingSnoozeTodoId: null, pendingSnoozeAt: null },
    });
    if (cancelled) await this.out.reply(replyToken, '好，不延後。沒按完成的話，明天同一時間會再提醒你。');
    return cancelled;
  }

  /** `（8/10）`／`（持續）`／`''` (for a pre-existing row with neither set —
   * see schema comment on ProjectTodo). */
  todoDateSuffix(todo: { dueDate: Date | null; isOngoing: boolean }): string {
    if (todo.isOngoing) return '（持續）';
    if (todo.dueDate) return `（${todo.dueDate.getMonth() + 1}/${todo.dueDate.getDate()}）`;
    return '';
  }

  /** Format reminder + the caller's incomplete personal todos, numbered —
   * those numbers are what "完成 N" resolves against next. */
  async sendTodoHelp(linkId: string, userId: string, replyToken: string) {
    const incomplete = await this.prisma.projectTodo.findMany({
      where: { personalOwnerUserId: userId, done: false },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });
    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: { lastTodoListIds: incomplete.map((t) => t.id) },
    });

    const lines = [
      '✅ 代辦事項',
      '新增8/10買材料｜完成2｜改期2 8/15',
      '',
      `未完成清單（${incomplete.length}）：`,
    ];
    lines.push(
      ...(incomplete.length
        ? incomplete.map((t, i) => `${i + 1}. ${t.title}${this.todoDateSuffix(t)}`)
        : ['（目前沒有未完成的代辦事項）']),
    );
    lines.push('', '傳「代辦事項總覽」看今天的狀況。');
    await this.out.reply(replyToken, lines.join('\n'));
  }

  /** 今日已完成、今日到期還沒完成、未來 7 天內到期、持續性任務（不受日期
   * 限制，永遠列出）—— 未完成的三組會連續編號，供「完成 N」使用；已完成的
   * 只是列出來看，沒有編號（沒有可以「完成」的動作）。 */
  async sendTodoOverviewAllProjects(
    linkId: string,
    userId: string,
    replyToken: string,
  ) {
    // Bounded to what the four buckets below can actually use (still-open,
    // or completed today) — this used to fetch the caller's entire todo
    // history unconditionally and filter in memory, the same unbounded-list
    // problem as TodosService.listAll (see 大系統V1.44.0).
    const { start: todayStart, end: todayEnd } = taipeiTodayRange();
    const todos = await this.prisma.projectTodo.findMany({
      where: {
        personalOwnerUserId: userId,
        OR: [{ done: false }, { done: true, completedAt: { gte: todayStart } }],
      },
      orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }],
    });
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
    const isSameDay = (d: Date) => d >= todayStart && d < todayEnd;

    const completedToday = todos.filter(
      (t) => t.completedAt && isSameDay(t.completedAt),
    );
    // 已逾期（到期日早於今天、還沒完成）——跟下面的「今日到期」是分開的兩
    // 種急迫程度，之前這個查詢雖然有抓到（done: false 沒有下限），但完全
    // 沒有被放進任何一個顯示區塊，等於憑空消失，使用者看不到。
    const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < todayStart);
    const dueToday = todos.filter(
      (t) => !t.done && t.dueDate && isSameDay(t.dueDate),
    );
    const restOfWeek = todos.filter(
      (t) =>
        !t.done && t.dueDate && t.dueDate >= todayEnd && t.dueDate < weekEnd,
    );
    const ongoing = todos.filter((t) => !t.done && t.isOngoing);

    await this.prisma.lineAccountLink.update({
      where: { id: linkId },
      data: {
        lastTodoListIds: [...overdue, ...dueToday, ...restOfWeek, ...ongoing].map((t) => t.id),
      },
    });

    const labelOf = (t: (typeof todos)[number]) => t.title;

    const lines: string[] = ['✅ 代辦事項總覽', ''];

    lines.push(`今日已完成（${completedToday.length}）：`);
    lines.push(
      ...(completedToday.length
        ? completedToday.map((t) => `・${labelOf(t)}`)
        : ['（沒有）']),
    );

    lines.push('', `⚠️ 已逾期未完成（${overdue.length}）：`);
    lines.push(
      ...(overdue.length
        ? overdue.map((t, i) => `${i + 1}. ${labelOf(t)}（${t.dueDate!.getMonth() + 1}/${t.dueDate!.getDate()}）`)
        : ['（沒有）']),
    );

    lines.push('', `今日到期但還沒完成（${dueToday.length}）：`);
    lines.push(
      ...(dueToday.length
        ? dueToday.map((t, i) => `${overdue.length + i + 1}. ${labelOf(t)}`)
        : ['（沒有）']),
    );

    lines.push('', `未來 7 天內到期（${restOfWeek.length}）：`);
    lines.push(
      ...(restOfWeek.length
        ? restOfWeek.map(
            (t, i) =>
              `${overdue.length + dueToday.length + i + 1}. ${labelOf(t)}（${t.dueDate!.getMonth() + 1}/${t.dueDate!.getDate()}）`,
          )
        : ['（沒有）']),
    );

    lines.push('', `持續性任務（${ongoing.length}）：`);
    lines.push(
      ...(ongoing.length
        ? ongoing.map(
            (t, i) => `${overdue.length + dueToday.length + restOfWeek.length + i + 1}. ${labelOf(t)}`,
          )
        : ['（沒有）']),
    );

    lines.push('', '傳「完成 編號」標記完成，或「改期 編號 新日期」改期，例如「完成 2」「改期 2 8/15」。');
    await this.out.reply(replyToken, lines.join('\n'));
  }

  /** Shared by `parseTodoCommand` (新增) and `rescheduleTodoByNumber`
   * (改期) — pulls a leading date (自我分隔, same digit+"/" style as
   * `parseCalendarCommand`) or the `持續` keyword off the front of `text`,
   * returning the parsed date/ongoing flag plus whatever's left. Returns
   * null if neither is found at the front. */
  parseDateOrOngoingPrefix(
    text: string,
  ): { dueDate: Date | null; dueDateAllDay: boolean; isOngoing: boolean; rest: string } | null {
    if (text.startsWith('持續')) {
      return {
        dueDate: null,
        dueDateAllDay: true,
        isOngoing: true,
        rest: text.slice(2).replace(LEADING_SEPARATORS, ''),
      };
    }
    const dateMatch = text.match(/^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,2}))?/);
    if (!dateMatch) return null;
    const year = dateMatch[3] ? Number(dateMatch[1]) : new Date().getFullYear();
    const month = Number(dateMatch[3] ? dateMatch[2] : dateMatch[1]);
    const day = Number(dateMatch[3] ?? dateMatch[2]);
    let rest = text.slice(dateMatch[0].length).replace(LEADING_SEPARATORS, '');

    // 可選的時間（跟「新增行事曆」同樣的 HH:MM 格式，2026-08-05 新增，讓代
    // 辦事項也能跟行事曆一樣帶時間）——沒有就整天，維持原本的行為。
    const timeMatch = rest.match(/^(\d{1,2}):(\d{2})/);
    let dueDate: Date;
    let dueDateAllDay: boolean;
    if (timeMatch) {
      const hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2]);
      dueDate = taipeiWallClockToUtc(year, month - 1, day, hour, minute);
      dueDateAllDay = false;
      rest = rest.slice(timeMatch[0].length).replace(LEADING_SEPARATORS, '');
    } else {
      dueDate = new Date(year, month - 1, day);
      dueDateAllDay = true;
    }
    if (Number.isNaN(dueDate.getTime())) return null;
    return { dueDate, dueDateAllDay, isOngoing: false, rest };
  }

  /** 每一筆代辦事項都必須是「有日期」或「持續性任務」二選一（2026-08-03 使
   * 用者明確要求），所以「新增」指令的日期/「持續」標記是必填，不是可省
   * 略的欄位 —— 沒偵測到任一種就直接請使用者補上，不會靜靜地新增一筆兩者
   * 都沒有的項目。 */
  parseTodoCommand(
    text: string,
  ):
    | { title: string; dueDate: Date | null; dueDateAllDay: boolean; isOngoing: boolean }
    | null
    | 'needs_date' {
    const rest = text.replace(/^新增(代辦|待辦)?/, '').replace(LEADING_SEPARATORS, '');
    const parsed = this.parseDateOrOngoingPrefix(rest);
    if (!parsed) return 'needs_date';

    const title = parsed.rest.replace(EDGE_SEPARATORS, '').trim();
    if (!title) return null;

    return { title, dueDate: parsed.dueDate, dueDateAllDay: parsed.dueDateAllDay, isOngoing: parsed.isOngoing };
  }

  async createTodoFromText(
    link: LineAccountLink,
    text: string,
    respond: Responder,
  ) {
    const parsed = this.parseTodoCommand(text);
    if (parsed === 'needs_date') {
      await respond(
        '請加上日期或標記「持續」，例如「新增 8/10 買材料」、「新增 8/10 14:00 買材料」或「新增 持續 每週檢查庫存」。',
      );
      return;
    }
    if (!parsed) {
      await respond('請在「新增」後面接代辦事項的內容，例如「新增 8/10 買材料」。');
      return;
    }
    const { title, dueDate, dueDateAllDay, isOngoing } = parsed;
    const dateLabel = isOngoing ? '持續' : formatTaipeiDateTime(dueDate!, dueDateAllDay);

    // 透過 TodosService 而不是直接寫 Prisma——這樣才會一併觸發代辦事項→
    // 行事曆的同步（2026-08-05），不用在這裡重複寫一次同步邏輯。
    await this.todosService.create(link.userId, {
      title,
      dueDate: dueDate?.toISOString(),
      dueDateAllDay,
      isOngoing,
    });
    await respond(`已新增代辦事項「${title}」（${dateLabel}）。`);
  }

  /** "完成 N" references the Nth item of whichever list (代辦事項 or
   * 代辦事項總覽) was shown to this LINE user most recently — see
   * `LineAccountLink.lastTodoListIds`. Numbers don't shift after a
   * completion within the same shown list; completing the same number
   * twice just reports it's already done. */
  async completeTodoByNumber(
    linkId: string,
    text: string,
    replyToken: string,
  ) {
    const match = text.match(/\d+/);
    if (!match) {
      await this.out.reply(
        replyToken,
        '請在「完成」後面接編號，例如「完成 2」，編號請先看「代辦事項」或「代辦事項總覽」。',
      );
      return;
    }
    const n = Number(match[0]);
    const link = await this.prisma.lineAccountLink.findUnique({
      where: { id: linkId },
    });
    const todoId = link?.lastTodoListIds[n - 1];
    if (!todoId) {
      await this.out.reply(
        replyToken,
        `找不到編號 ${n}，請先傳「代辦事項」或「代辦事項總覽」看目前的編號。`,
      );
      return;
    }
    const todo = await this.prisma.projectTodo.findUnique({
      where: { id: todoId },
    });
    if (!todo) {
      await this.out.reply(replyToken, '這筆代辦事項好像已經被刪除了。');
      return;
    }
    if (todo.done) {
      await this.out.reply(replyToken, `「${todo.title}」已經是完成狀態了。`);
      return;
    }
    await this.prisma.projectTodo.update({
      where: { id: todo.id },
      data: { done: true, completedAt: new Date() },
    });
    await this.out.reply(replyToken, `已完成「${todo.title}」。`);
  }

  /** "改期 N 日期或「持續」" — same numbered-list reference as「完成 N」,
   * lets a todo be rescheduled (or switched to/from 持續性任務) without
   * having to delete and recreate it. */
  async rescheduleTodoByNumber(
    linkId: string,
    text: string,
    replyToken: string,
  ) {
    const rest = text.replace(/^改期/, '').replace(LEADING_SEPARATORS, '');
    const numberMatch = rest.match(/^\d+/);
    if (!numberMatch) {
      await this.out.reply(
        replyToken,
        '請在「改期」後面接編號跟新日期（或「持續」），例如「改期 2 8/15」或「改期 2 持續」，編號請先看「代辦事項」或「代辦事項總覽」。',
      );
      return;
    }
    const n = Number(numberMatch[0]);
    const afterNumber = rest.slice(numberMatch[0].length).replace(LEADING_SEPARATORS, '');

    const parsed = this.parseDateOrOngoingPrefix(afterNumber);
    if (!parsed) {
      await this.out.reply(
        replyToken,
        '請在編號後面接新日期或「持續」，例如「改期 2 8/15」或「改期 2 持續」。',
      );
      return;
    }

    const link = await this.prisma.lineAccountLink.findUnique({
      where: { id: linkId },
    });
    const todoId = link?.lastTodoListIds[n - 1];
    if (!todoId) {
      await this.out.reply(
        replyToken,
        `找不到編號 ${n}，請先傳「代辦事項」或「代辦事項總覽」看目前的編號。`,
      );
      return;
    }
    const todo = await this.prisma.projectTodo.findUnique({
      where: { id: todoId },
    });
    if (!todo) {
      await this.out.reply(replyToken, '這筆代辦事項好像已經被刪除了。');
      return;
    }
    // 透過 TodosService 而不是直接寫 Prisma，理由跟「新增」一樣——一併觸發
    // 代辦事項→行事曆同步。
    await this.todosService.update(link!.userId, todo.id, {
      dueDate: parsed.dueDate?.toISOString() ?? null,
      dueDateAllDay: parsed.dueDateAllDay,
      isOngoing: parsed.isOngoing,
    });
    const dateLabel = parsed.isOngoing ? '持續' : formatTaipeiDateTime(parsed.dueDate!, parsed.dueDateAllDay);
    await this.out.reply(replyToken, `已將「${todo.title}」改期為 ${dateLabel}。`);
  }

  // --- 人生目標 ---

  /** 唯讀 — 新增/更新進度目前只在 App 端做（數字型目標的「目前值」用打字
   * 輸入不太自然），LINE 這裡先只做「隨時看得到進度」這件事。 */
  async sendLifeGoals(userId: string, replyToken: string) {
    const goals = await this.lifeGoalsService.listAll(userId, LifeGoalStatus.ACTIVE);
    if (goals.length === 0) {
      await this.out.reply(
        replyToken,
        '🎯 人生目標\n\n目前沒有進行中的目標。可以直接跟我說，例如「新增目標 年底前存到15萬」。',
      );
      return;
    }

    const lines = ['🎯 人生目標', ''];
    for (const g of goals) {
      const dateLabel = g.targetDate ? `（期限 ${g.targetDate.getUTCMonth() + 1}/${g.targetDate.getUTCDate()}）` : '';
      const progress = formatGoalProgress(g);
      lines.push(progress ? `・${g.title}${dateLabel}\n　${progress}` : `・${g.title}${dateLabel}`);
    }
    lines.push('', '直接跟我說進度就會記錄，例如「體重現在72」「今天運動了」');
    await this.out.reply(replyToken, lines.join('\n'));
  }
}
