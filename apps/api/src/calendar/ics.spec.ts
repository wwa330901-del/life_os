import { buildIcsEvent, escapeIcsText } from './ics';

describe('buildIcsEvent', () => {
  const now = new Date('2026-09-30T00:00:00Z');

  it('writes a timed event in UTC, defaulting to one hour', () => {
    const ics = buildIcsEvent(
      { uid: 'abc', title: '開會', startAt: new Date('2026-10-01T06:00:00Z'), endAt: null, allDay: false },
      now,
    );
    expect(ics).toContain('UID:abc');
    expect(ics).toContain('DTSTART:20261001T060000Z');
    expect(ics).toContain('DTEND:20261001T070000Z');
    expect(ics).toContain('SUMMARY:開會');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('writes an all-day event with an exclusive end date', () => {
    const ics = buildIcsEvent(
      {
        uid: 'x',
        title: '旅行',
        startAt: new Date('2026-10-10T00:00:00Z'),
        endAt: new Date('2026-10-12T00:00:00Z'),
        allDay: true,
      },
      now,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261010');
    expect(ics).toContain('DTEND;VALUE=DATE:20261013');
  });

  it('escapes special characters', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});
