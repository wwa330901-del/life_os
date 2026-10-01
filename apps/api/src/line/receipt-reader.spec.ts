import { parseReceipt, receiptToAgentText } from './receipt-reader.service';

describe('parseReceipt', () => {
  it('reads a receipt', () => {
    const r = parseReceipt(
      JSON.stringify({ isReceipt: true, merchant: '星巴克', total: 155.4, date: '2026-10-01', items: '拿鐵、可頌', paymentMethod: '信用卡' }),
    );
    expect(r).toEqual({ merchant: '星巴克', total: 155, date: '2026-10-01', items: '拿鐵、可頌', paymentMethod: '信用卡' });
  });

  it('treats non-receipts and receipts without an amount as not a receipt', () => {
    expect(parseReceipt(JSON.stringify({ isReceipt: false }))).toBeNull();
    expect(parseReceipt(JSON.stringify({ isReceipt: true, merchant: '全家' }))).toBeNull();
    expect(parseReceipt(JSON.stringify({ isReceipt: true, total: 0 }))).toBeNull();
    expect(parseReceipt(undefined)).toBeNull();
  });

  it('drops a malformed date and blank fields', () => {
    const r = parseReceipt(JSON.stringify({ isReceipt: true, total: 80, date: '115/10/01', merchant: ' ' }));
    expect(r).toEqual({ merchant: null, total: 80, date: null, items: null, paymentMethod: null });
  });
});

describe('receiptToAgentText', () => {
  it('only includes what was read', () => {
    const text = receiptToAgentText({ merchant: '全家', total: 65, date: null, items: null, paymentMethod: null });
    expect(text).toContain('金額 65 元');
    expect(text).toContain('店家：全家');
    expect(text).not.toContain('日期');
    expect(text).not.toContain('付款方式');
  });
});
