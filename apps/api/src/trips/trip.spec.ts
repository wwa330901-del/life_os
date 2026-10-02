import { dueReminder, mergePacking, parseTripDraft, setPacked, tripDates, tripPlanText, validateTripDates } from './trip';

describe('parseTripDraft', () => {
  it('每天都有、超出日期的丟掉、金額取整、經緯度要成對', () => {
    const raw = JSON.stringify({
      latitude: 35.68,
      longitude: 139.76,
      budget: { transport: 15000.4, lodging: 20000, food: -5, tickets: 'x' },
      itinerary: [
        { date: '2026-11-01', items: [{ time: '9:00', title: '淺草寺', place: '淺草' }, { title: '' }] },
        { date: '2026-12-25', items: [{ title: '不在行程內' }] },
      ],
      packingList: ['護照', '護照', '轉接頭', ''],
      tips: '  記得買 Suica ',
    });
    const d = parseTripDraft(raw, '2026-11-01', '2026-11-03');
    expect(d.itinerary.map((x) => x.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(d.itinerary[0].items).toEqual([{ time: '09:00', title: '淺草寺', place: '淺草', note: null }]);
    expect(d.itinerary[1].items).toEqual([]);
    expect(d.budget).toEqual({ transport: 15000, lodging: 20000, food: 0, tickets: 0, shopping: 0, other: 0 });
    expect(d.packingList).toEqual(['護照', '轉接頭']);
    expect(d.tips).toBe('記得買 Suica');
    expect(d.latitude).toBe(35.68);
    expect(parseTripDraft(JSON.stringify({ latitude: 35 }), '2026-11-01', '2026-11-01').latitude).toBeNull();
  });
});

describe('日期', () => {
  it('含頭尾', () => {
    expect(tripDates('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
  it('不合理的擋下', () => {
    expect(validateTripDates('2026-11-05', '2026-11-01')).toContain('不能比出發早');
    expect(validateTripDates('2026/11/05', '2026-11-06')).toContain('格式');
    expect(validateTripDates('2026-11-01', '2026-11-01')).toBeNull();
  });
});

describe('行李', () => {
  it('重新規劃保留打勾', () => {
    const merged = mergePacking(
      [
        { item: '護照', packed: true },
        { item: '雨傘', packed: false },
        { item: '自拍棒', packed: true },
      ],
      ['護照', '外套'],
    );
    expect(merged).toEqual([
      { item: '護照', packed: true },
      { item: '外套', packed: false },
      { item: '自拍棒', packed: true },
    ]);
  });
  it('講的打勾，模糊比對，找不到就新增', () => {
    const r = setPacked([{ item: '護照（影本也帶）', packed: false }], ['護照', '耳機'], true);
    expect(r.matched).toEqual(['護照（影本也帶）']);
    expect(r.added).toEqual(['耳機']);
    expect(r.list.every((p) => p.packed)).toBe(true);
  });
});

describe('dueReminder', () => {
  it('前 7 天、前 1 天、回來隔天各一次', () => {
    expect(dueReminder('2026-10-25', '2026-11-01', '2026-11-03', '')).toBe('7d');
    expect(dueReminder('2026-10-25', '2026-11-01', '2026-11-03', '7d')).toBeNull();
    expect(dueReminder('2026-10-31', '2026-11-01', '2026-11-03', '7d')).toBe('1d');
    expect(dueReminder('2026-11-04', '2026-11-01', '2026-11-03', '7d,1d')).toBe('after');
    expect(dueReminder('2026-11-02', '2026-11-01', '2026-11-03', '')).toBeNull();
  });
});

it('tripPlanText', () => {
  const text = tripPlanText({
    destination: '東京',
    startDate: '2026-11-01',
    endDate: '2026-11-02',
    travelers: 2,
    budget: { transport: 30000, lodging: 20000, food: 10000, tickets: 0, shopping: 0, other: 0 },
    budgetTotal: 60000,
    itinerary: [
      { date: '2026-11-01', items: [{ time: '09:00', title: '淺草寺', place: '淺草', note: null }] },
      { date: '2026-11-02', items: [] },
    ],
    packingList: [],
    tips: null,
  });
  expect(text).toContain('東京 2 天（11/1～11/2，2 人）');
  expect(text).toContain('預估花費 60,000 元');
  expect(text).toContain('交通 30,000・住宿 20,000・吃飯 10,000');
  expect(text).toContain('・09:00 淺草寺（淺草）');
});
