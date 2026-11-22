import { type LineMessageButton } from '../line-notifier/line-notifier.service';

/** AI 問確認時下面的按鈕；按了等於使用者打了 AI_POSTBACK_TEXT 那句話。 */
export const CONFIRM_BUTTONS: LineMessageButton[] = [
  { label: '確定', data: 'ai:confirm' },
  { label: '取消', data: 'ai:cancel' },
];
export const AI_POSTBACK_TEXT: Record<string, string> = {
  'ai:confirm': '確定，照這樣做',
  'ai:cancel': '取消，不要做',
};

export const SNOOZE_REPLY_WINDOW_MS = 30 * 60 * 1000;

export interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; id?: string; text?: string; latitude?: number; longitude?: number; address?: string; title?: string; quotedMessageId?: string };
  postback?: { data?: string; params?: { datetime?: string } };
}

/** A handler's one output message, decoupled from *how* it gets to the
 * user — a single-line command replies via this straight to LINE
 * (`(text) => this.reply(replyToken, text)`); a line inside a 條列式批次
 * message instead pushes into an array to fold into one combined reply
 * (see `tryBatchLine`). Every 登陸-style command (記帳/代辦新增/股票買賣/
 * 新增行事曆) takes one of these instead of a bare `replyToken` so it works
 * unchanged in both contexts. */
export type Responder = (text: string) => Promise<void>;

/** A LINE-command separator can be whitespace, common punctuation, or
 * nothing at all (fields typed glued together) — this app's users wanted
 * the parser to be lenient rather than making them remember an exact
 * delimiter, so every free-text command strips these opportunistically
 * instead of splitting on them. */
export const SEPARATORS = /[\s\-+*/,，、]+/;
export const LEADING_SEPARATORS = new RegExp(`^${SEPARATORS.source}`);
export const EDGE_SEPARATORS = new RegExp(
  `^${SEPARATORS.source}|${SEPARATORS.source}$`,
  'g',
);

export const LINK_CODE_TTL_MINUTES = 10;

/** 看不懂時的回覆：短短一句＋常用的選項按鈕（按了等於傳那句話）。 */
export function notUnderstoodMessage(text: string): Record<string, unknown> {
  const shown = text.length > 20 ? `${text.slice(0, 20)}…` : text;
  const options: [string, string][] = [
    ['📖 我能做什麼', '我能做什麼'],
    ['💰 財務總覽', '財務總覽'],
    ['✅ 代辦事項', '代辦事項總覽'],
    ['📅 今天行程', '今日行事曆'],
    ['🎯 人生目標', '人生目標'],
  ];
  return {
    type: 'text',
    text: `我沒看懂「${shown}」🤔\n\n可以換個說法再講一次，例如「午餐 120」「明天 3 點看牙醫」；或點下面的選項 👇`,
    quickReply: {
      items: options.map(([label, msg]) => ({ type: 'action', action: { type: 'message', label, text: msg } })),
    },
  };
}

/** 「我能做什麼」的 5 個主題（按鈕 label 最多 20 字）。 */
export const GUIDE_TOPICS: Record<string, { label: string; text: string }> = {
  money: {
    label: '💰 錢',
    text: [
      '💰 錢',
      '「午餐 120」「昨天加油 1500 刷卡」，收據、發票拍照傳給我也行',
      '「這個月花了多少？」「我每個帳戶還剩多少？」',
      '好幾天沒記帳：「現金其實只剩 3000」幫你平帳，之前的帳不動',
      '「國泰卡每月 5 號結帳、20 號繳款」設好會提醒繳卡費',
      '「借小明 3000，他說月底還」「小明還我 1000」「誰還欠我錢？」',
      '「買了 3 張 0050 成交 152」「我的股票賺多少？」',
      '「剛剛那筆改成 150」「刪掉昨天的計程車」',
    ].join('\n'),
  },
  time: {
    label: '📅 時間和代辦',
    text: [
      '📅 時間和代辦',
      '「明天下午三點看牙醫」「這週有什麼行程？」',
      '「幫我排兩小時健身」我會找空檔問你',
      '「提醒我週五交報告」「報告做完了」「我還有什麼沒做？」',
      '「10 分鐘後提醒我關火」時間到 LINE 叫你，按「延後」可以自己打時間',
      '每天 8 點早報：今天行程、該做的事、放太久的代辦',
    ].join('\n'),
  },
  growth: {
    label: '🎯 目標和日記',
    text: [
      '🎯 目標和日記',
      '「我想今年存到50萬」幫你開目標；「今天運動了」「體重現在72」自動打卡',
      '「看完一本書」我會問你心得',
      '直接講今天發生的事就會記成日記，每晚 9:30 沒寫會問你',
      '傳「週回顧」「月回顧」，週日晚上和每月 1 號也會自動傳',
    ].join('\n'),
  },
  plan: {
    label: '🧭 規劃',
    text: [
      '🧭 規劃',
      '「幫我規劃這週」「今天先做什麼好？」「這個月還能花多少？」',
      '傳「財務健檢」看 0～100 分；「財務規劃」拿每月分配和建議預算',
      '「想買 AirPods 7490」排進購物車，算什麼時候買得起',
      '「11/1～11/5 想去東京」排行程、估預算、列行李',
      '「我幾歲可以退休？」「如果每月多存 5000 呢？」',
    ].join('\n'),
  },
  other: {
    label: '🧠 其他',
    text: [
      '🧠 其他',
      '「記住我不吃牛」「媽媽生日是農曆 9 月 1 號」會記得、會提醒',
      '傳連結／圖片／影片給我自動收藏；「之前存的那篇理財文章」找回來',
      '「今天天氣如何？」「我想算這次換工作順不順」',
      '長按我傳的訊息按「回覆」再打字，我就知道你在講哪一則',
      '也可以單純聊天、問意見 🙂',
    ].join('\n'),
  },
};
