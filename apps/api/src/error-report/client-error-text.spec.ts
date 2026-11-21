import { localizeClientError } from './client-error-text';

describe('localizeClientError', () => {
  it('密碼錯：專屬中文，英文留在 detail', () => {
    expect(localizeClientError(401, 'Invalid username or password')).toEqual({
      message: '帳號或密碼錯誤',
      detail: 'Invalid username or password',
    });
  });

  it('欄位檢查（英文陣列）→ 依狀態碼的中文', () => {
    expect(localizeClientError(400, ['amount must be a number'])).toEqual({
      message: '填的資料格式不對，請檢查一下再送出',
      detail: 'amount must be a number',
    });
  });

  it('找不到的英文 → 中文', () => {
    expect(localizeClientError(404, 'Finance account not found')?.message).toBe('找不到這筆資料，可能已經被刪掉了');
  });

  it('路由不存在（舊版 App 打到沒有的功能）', () => {
    expect(localizeClientError(404, 'Cannot GET /x')?.message).toBe('找不到這個功能，可能要更新 App');
  });

  it('本來就是中文的不動', () => {
    expect(localizeClientError(400, '金額要大於 0')).toBeNull();
    expect(localizeClientError(400, ['金額要大於 0'])).toBeNull();
  });
});
