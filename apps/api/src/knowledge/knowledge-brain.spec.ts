import { dueEventReminder } from './knowledge-exhibition-reminder.service';

describe('dueEventReminder（展覽提醒）', () => {
  const none = new Set<'start' | 'end14' | 'end3'>();
  it('開展當天提醒', () => expect(dueEventReminder('2026-11-01', '2026-11-01', '2026-12-31', none)).toBe('start'));
  it('開展後 2 天內還補得到，3 天後就不補', () => {
    expect(dueEventReminder('2026-11-03', '2026-11-01', '2026-12-31', none)).toBe('start');
    expect(dueEventReminder('2026-11-04', '2026-11-01', '2026-12-31', none)).toBeNull();
  });
  it('結束前 14 天', () => expect(dueEventReminder('2026-11-22', '2026-11-01', '2026-12-06', none)).toBe('end14'));
  it('結束前 3 天', () => expect(dueEventReminder('2026-12-03', null, '2026-12-06', new Set(['end14']))).toBe('end3'));
  it('最後一天也提醒', () => expect(dueEventReminder('2026-12-06', null, '2026-12-06', new Set(['end14']))).toBe('end3'));
  it('發過就不再發', () => expect(dueEventReminder('2026-12-04', null, '2026-12-06', new Set(['end3']))).toBeNull());
  it('已經結束不發', () => expect(dueEventReminder('2026-12-07', null, '2026-12-06', none)).toBeNull());
  it('還很久不發', () => expect(dueEventReminder('2026-11-01', null, '2026-12-31', none)).toBeNull());
});

import { sourceKeyForText, sourceKeyForUrl } from './knowledge-source-key';

describe('sourceKeyForUrl（重複偵測）', () => {
  it('IG 貼文不管怎麼分享都一樣', () => {
    expect(sourceKeyForUrl('https://www.instagram.com/p/ABC123/?igsh=xyz')).toBe('ig:ABC123');
    expect(sourceKeyForUrl('https://instagram.com/someone/p/ABC123')).toBe('ig:ABC123');
    expect(sourceKeyForUrl('https://www.instagram.com/reel/ABC123/')).toBe('ig:ABC123');
  });
  it('YouTube 長短網址一樣', () => {
    expect(sourceKeyForUrl('https://youtu.be/dQw4?si=abc')).toBe('yt:dQw4');
    expect(sourceKeyForUrl('https://www.youtube.com/watch?v=dQw4&t=30')).toBe('yt:dQw4');
    expect(sourceKeyForUrl('https://m.youtube.com/shorts/dQw4')).toBe('yt:dQw4');
  });
  it('一般網址拿掉追蹤參數、#、結尾斜線', () => {
    expect(sourceKeyForUrl('https://www.example.com/a/b/?utm_source=x&id=2#top')).toBe('url:example.com/a/b?id=2');
    expect(sourceKeyForUrl('https://example.com/a/b?id=2')).toBe('url:example.com/a/b?id=2');
  });
  it('不是網址回 null', () => expect(sourceKeyForUrl('hello')).toBeNull());
  it('文字空白不同也算一樣', () => expect(sourceKeyForText('a  b\nc')).toBe(sourceKeyForText(' a b c ')));
});
