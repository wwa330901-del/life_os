// 上傳 10 套外觀風格的 LINE 圖文選單（圖先跑 make-theme-images.ps1），每套掛別名 theme-{id}。
// 後端 users/line-rich-menu.service.ts 依每個人在 App 選的風格把對應選單連到他的 LINE；
// 「晨光」同時設為預設選單（還沒綁定的人看到的）。重跑會換成新圖並刪掉舊的。
// 用法：LINE_TOKEN=<channel access token> node upload-themes.js   （token 不要存進任何檔案）
const fs = require('fs');
const path = require('path');

const token = process.env.LINE_TOKEN;
if (!token) throw new Error('請設定 LINE_TOKEN');

// 要跟 apps/windows_app/lib/core/theme/app_themes.dart 的 id 一致
const THEMES = ['dawn', 'ink-gold', 'paper', 'forest', 'ocean', 'sakura', 'night', 'nordic', 'retro', 'candy'];
const W = 2500, H = 1686, COLS = 4, ROWS = 2;
// 按鈕送出的文字要跟 apps/api/src/line/line.service.ts 的 MENU_COMMANDS 對得上（「算命」故意交給 AI）
const TEXTS = ['財務總覽', '今日行事曆', '代辦事項總覽', '人生目標', '知識庫', '購物車', '算命', '我能做什麼'];
const cw = W / COLS, ch = H / ROWS;

async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const body = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${init.method ?? 'GET'} ${url} → ${res.status} ${body}`), { status: res.status });
  return body ? JSON.parse(body) : {};
}
const post = (url, json) =>
  api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) });

(async () => {
  const before = await api('https://api.line.me/v2/bot/user/all/richmenu').catch(() => ({}));
  const toDelete = new Set(before.richMenuId ? [before.richMenuId] : []);
  let dawnId;

  for (const id of THEMES) {
    const alias = `theme-${id}`;
    const { richMenuId } = await post('https://api.line.me/v2/bot/richmenu', {
      size: { width: W, height: H },
      selected: true,
      name: `元序選單 ${alias}`,
      chatBarText: '選單（可直接打字問AI）',
      areas: TEXTS.map((text, i) => ({
        bounds: { x: Math.round((i % COLS) * cw), y: Math.round(Math.floor(i / COLS) * ch), width: Math.round(cw), height: Math.round(ch) },
        action: { type: 'message', text },
      })),
    });
    await api(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: fs.readFileSync(path.join(__dirname, 'themes', `${id}.jpg`)),
    });
    const old = await api(`https://api.line.me/v2/bot/richmenu/alias/${alias}`).catch((e) => {
      if (e.status === 404) return null;
      throw e;
    });
    if (old) {
      await post(`https://api.line.me/v2/bot/richmenu/alias/${alias}`, { richMenuId });
      toDelete.add(old.richMenuId);
    } else {
      await post('https://api.line.me/v2/bot/richmenu/alias', { richMenuAliasId: alias, richMenuId });
    }
    console.log(alias, richMenuId);
    if (id === 'dawn') dawnId = richMenuId;
  }

  await api(`https://api.line.me/v2/bot/user/all/richmenu/${dawnId}`, { method: 'POST', headers: { 'Content-Length': '0' } });
  console.log('晨光已設為預設選單');
  // 連到使用者身上的舊選單刪掉後 LINE 會改顯示預設選單；後端下次啟動或換風格時會再連新的
  for (const id of toDelete) {
    await api(`https://api.line.me/v2/bot/richmenu/${id}`, { method: 'DELETE' });
    console.log('已刪除舊選單', id);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
