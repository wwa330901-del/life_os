/* 閒聊分流驗收（2026-10-02）：用真的 Gemini 跑一組標好答案的訊息，確認
 * 「要做事的一定交給 Agent」（漏一個就是少一個功能），閒聊盡量走輕量 AI。
 *
 * 用法（本機，DB 要開著）：
 *   GEMINI_API_KEY=... [AI_CHAT_MODEL=gemini-3.5-flash-lite] npm run build && node dist/src/scripts/eval-chat-router.js
 * 只看分流判斷，不會真的記帳或改資料（輕量 AI 只有 use_agent 這一個工具）。 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ChatTurn } from '../ai-agent/chat-router';

const NEEDS_AGENT = [
  '午餐 120',
  '昨天加油花了1500',
  '這個月花了多少錢',
  '我還有什麼代辦沒做',
  '明天下午三點看牙醫',
  '幫我排兩小時去健身',
  '今天跑步30分鐘',
  '昨晚12點睡7點起',
  '體重72',
  '我讀完原子習慣了',
  '我想算這次換工作順不順',
  '我的持股賺多少',
  '我有哪些訂閱',
  '借小明5000他說月底還',
  '卡費繳好了',
  '想買 AirPods 7490',
  '我不吃牛肉',
  '我老婆生日是3月15號',
  '我在台積電上班',
  '幫我規劃這週',
  '這個月還能花多少',
  '剛剛那筆改成150',
  '之前存的那篇理財文章在哪',
  '今天跟家人去吃飯很開心',
  '今天好累喔',
  '心情不太好',
  '剛剛去健身房回來',
  '今天被老闆罵了',
  '中午吃了一碗拉麵',
  '看完一本小說了',
  '關掉早報',
  '元序可以做什麼',
];

const PLAIN_CHAT = [
  '你好',
  '早安',
  '謝謝你',
  '哈哈好好笑',
  '晚安',
  '你是誰',
  '幫我寫一封請假信',
  '咖啡因對身體有什麼影響',
  '幫我翻譯 thank you for your help',
  '光合作用是什麼',
  '推薦幾本經典小說',
  '講個笑話',
  '幫我想一句生日祝福的話',
  '你覺得人生的意義是什麼',
  '台灣最高的山是哪座',
  '1公尺等於幾英呎',
  // 不用元序資料的工具，輕量 AI 自己查
  '今天天氣如何',
  '要帶傘嗎',
  '台積電最近走勢怎樣',
  '0050 的殖利率多少',
];

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('要設 GEMINI_API_KEY');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const agent = app.get(AiAgentService);
  const prisma = app.get(PrismaService);
  const user = await prisma.user.findFirstOrThrow();
  // 輕量 AI 失敗（例如額度用完）也會回 null＝交給 Agent，看起來像通過——要另外算。
  const failures = () => prisma.aiUsageLog.count({ where: { userId: user.id, feature: 'app_ai_chat', status: 'FAILED' } });
  let errors = 0;
  const judge = async (text: string) => {
    const before = await failures();
    const reply = await chatOnce(text);
    const failed = (await failures()) > before;
    if (failed) errors++;
    return { reply, failed };
  };
  const chatOnce = (text: string): Promise<string | null> =>
    (agent as unknown as { chatOnce: (u: string, k: string, c: unknown, t: string, turns: ChatTurn[]) => Promise<string | null> }).chatOnce(
      user.id,
      apiKey,
      { kind: 'app' },
      text,
      [],
    );

  const missed: string[] = [];
  for (const text of NEEDS_AGENT) {
    const { reply, failed } = await judge(text);
    if (failed) {
      console.log('⚠️ 失敗  ', text);
      continue;
    }
    if (reply != null) missed.push(`${text} → 輕量 AI 自己回了：${reply.slice(0, 40)}`);
    console.log(reply == null ? '✅ Agent ' : '❌ 漏了  ', text);
  }
  let light = 0;
  for (const text of PLAIN_CHAT) {
    const { reply, failed } = await judge(text);
    if (failed) {
      console.log('⚠️ 失敗  ', text);
      continue;
    }
    if (reply != null) light++;
    console.log(reply != null ? '💬 輕量  ' : '↪️ Agent ', text, reply ? `→ ${reply.slice(0, 30)}` : '');
  }
  console.log('');
  console.log(`要做事的：${NEEDS_AGENT.length - missed.length}/${NEEDS_AGENT.length} 交給 Agent`);
  console.log(`閒聊：${light}/${PLAIN_CHAT.length} 用輕量 AI（省錢的部分）`);
  if (missed.length) console.log('漏掉的：\n' + missed.join('\n'));
  if (errors) console.log(`⚠️ 有 ${errors} 次呼叫失敗（額度或網路），這次結果不算數`);
  const pass = missed.length === 0 && errors === 0;
  console.log(pass ? 'PASS' : 'FAIL');
  await app.close();
  process.exit(pass ? 0 : 1);
}

void main();
