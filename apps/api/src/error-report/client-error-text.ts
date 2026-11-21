// 4xx 錯誤給使用者看的中文（2026-11-22）：程式裡還有英文訊息、欄位檢查（class-validator）
// 也是英文，一律在這裡換成中文；英文原文放 detail，App 的「複製給 Claude」看得到。

const CJK = /[㐀-鿿]/;

/** 常見的英文訊息 → 專屬的中文。 */
const EXACT: Record<string, string> = {
  'Invalid username or password': '帳號或密碼錯誤',
  'Email already registered': '這個 Email 已經註冊過了，可以直接登入',
  'Username already taken': '這個帳號名稱已經有人用了，換一個試試',
  'Google did not return an ID token': 'Google 登入沒有完成，請再試一次',
  'Google account has no verified email': '這個 Google 帳號的 Email 還沒驗證，請先到 Google 驗證',
  Unauthorized: '登入過期了，請重新登入',
  'Too Many Requests': '太頻繁了，請等一下再試',
  'ThrottlerException: Too Many Requests': '太頻繁了，請等一下再試',
};

const BY_STATUS: Record<number, string> = {
  400: '填的資料格式不對，請檢查一下再送出',
  401: '登入過期了，請重新登入',
  403: '你沒有權限看這筆資料',
  404: '找不到這筆資料，可能已經被刪掉了',
  409: '這筆資料跟現有的衝突了',
  413: '檔案太大了',
  429: '太頻繁了，請等一下再試',
};

function hasChinese(message: unknown): boolean {
  if (typeof message === 'string') return CJK.test(message);
  if (Array.isArray(message)) return message.length > 0 && message.every(hasChinese);
  return false;
}

/** 回傳要不要換、換成什麼；本來就是中文的照原樣（回 null）。 */
export function localizeClientError(status: number, message: unknown): { message: string; detail: string } | null {
  if (hasChinese(message)) return null;
  const original = Array.isArray(message) ? message.join('; ') : String(message ?? '');
  const exact = EXACT[original];
  const text = exact ?? (original.startsWith('Cannot ') ? '找不到這個功能，可能要更新 App' : BY_STATUS[status] ?? `操作失敗（${status}）`);
  return { message: text, detail: original };
}
