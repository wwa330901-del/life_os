// 上傳 LINE 圖文選單並設為所有人的預設選單，再刪掉舊的。
// 用法：LINE_TOKEN=<channel access token> node upload.js   （token 不要存進任何檔案）
// 按鈕送出的文字要跟 apps/api/src/line/line.service.ts 的 MENU_COMMANDS 對得上
// （「算命」例外：故意交給 AI，讓它先問你想算什麼）。
const fs = require('fs');
const path = require('path');

const token = process.env.LINE_TOKEN;
if (!token) throw new Error('請設定 LINE_TOKEN');

const W = 2500, H = 1686, COLS = 4, ROWS = 2;
const TEXTS = ['財務總覽', '今日行事曆', '代辦事項總覽', '人生目標', '知識庫', '健康', '算命', '我能做什麼'];
const cw = W / COLS, ch = H / ROWS;

const menu = {
  size: { width: W, height: H },
  selected: true,
  name: `元序選單 v4 ${new Date().toISOString().slice(0, 10)}`,
  chatBarText: '選單（可直接打字問AI）',
  areas: TEXTS.map((text, i) => ({
    bounds: { x: Math.round((i % COLS) * cw), y: Math.round(Math.floor(i / COLS) * ch), width: Math.round(cw), height: Math.round(ch) },
    action: { type: 'message', text },
  })),
};

async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status} ${body}`);
  return body ? JSON.parse(body) : {};
}

(async () => {
  const before = await api('https://api.line.me/v2/bot/user/all/richmenu').catch(() => ({}));
  const { richMenuId } = await api('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(menu),
  });
  console.log('建立', richMenuId);
  await api(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: fs.readFileSync(path.join(__dirname, 'richmenu.png')),
  });
  console.log('圖片已上傳');
  await api(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST', headers: { 'Content-Length': '0' } });
  console.log('已設為預設選單');
  if (before.richMenuId && before.richMenuId !== richMenuId) {
    await api(`https://api.line.me/v2/bot/richmenu/${before.richMenuId}`, { method: 'DELETE' });
    console.log('已刪除舊選單', before.richMenuId);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
