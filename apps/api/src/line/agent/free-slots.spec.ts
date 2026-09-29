import { findFreeSlots, parseClock } from './free-slots';

// Taipei wall clock → UTC instant.
function tp(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - 8, mi));
}

describe('findFreeSlots', () => {
  // 2026-10-05 is a Monday (ordinary workday).
  it('puts WORK in weekday 08:00–18:00, skipping busy time', () => {
    const slots = findFreeSlots({
      kind: 'WORK',
      durationMinutes: 120,
      from: tp(2026, 10, 5, 7, 0),
      to: tp(2026, 10, 5, 23, 59),
      busy: [{ start: tp(2026, 10, 5, 8, 0), end: tp(2026, 10, 5, 11, 0) }],
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].start.toISOString()).toBe(tp(2026, 10, 5, 11, 0).toISOString());
    expect(slots[0].end.toISOString()).toBe(tp(2026, 10, 5, 13, 0).toISOString());
  });

  it('puts PERSONAL on weekday evenings', () => {
    const slots = findFreeSlots({
      kind: 'PERSONAL',
      durationMinutes: 60,
      from: tp(2026, 10, 5, 12, 0),
      to: tp(2026, 10, 5, 23, 59),
      busy: [{ start: tp(2026, 10, 5, 19, 0), end: tp(2026, 10, 5, 20, 0) }],
    });
    expect(slots[0].start.toISOString()).toBe(tp(2026, 10, 5, 20, 0).toISOString());
  });

  it('puts PERSONAL on holiday daytime, one per day', () => {
    const slots = findFreeSlots({
      kind: 'PERSONAL',
      durationMinutes: 60,
      from: tp(2026, 10, 9, 12, 0), // Friday noon
      to: tp(2026, 10, 11, 23, 59), // through Sunday
      busy: [],
    });
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      tp(2026, 10, 9, 12, 0).toISOString(), // 10/9 國慶日補假 → 假日時段，從 from 的中午開始
      tp(2026, 10, 10, 10, 0).toISOString(), // Sat 10:00 (also 國慶日)
      tp(2026, 10, 11, 10, 0).toISOString(), // Sun 10:00
    ]);
  });

  it('never schedules WORK on a holiday or weekend (10/9 補假 + 10/10–11 週末)', () => {
    const slots = findFreeSlots({
      kind: 'WORK',
      durationMinutes: 60,
      from: tp(2026, 10, 9, 0, 0),
      to: tp(2026, 10, 11, 23, 59),
      busy: [],
    });
    expect(slots).toHaveLength(0);
  });

  it('honours a custom window', () => {
    const slots = findFreeSlots({
      kind: 'PERSONAL',
      durationMinutes: 30,
      from: tp(2026, 10, 5, 0, 0),
      to: tp(2026, 10, 5, 23, 59),
      busy: [],
      customWindow: { startMinute: 6 * 60, endMinute: 7 * 60 },
    });
    expect(slots[0].start.toISOString()).toBe(tp(2026, 10, 5, 6, 0).toISOString());
  });
});

describe('parseClock', () => {
  it('parses HH:mm', () => {
    expect(parseClock('19:30')).toBe(19 * 60 + 30);
    expect(parseClock('bad')).toBeNull();
  });
});
