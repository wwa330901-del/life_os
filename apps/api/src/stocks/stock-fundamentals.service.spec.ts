import { parseRssItems, rocYearMonth } from './stock-fundamentals.service';

describe('stock fundamentals parsing', () => {
  it('converts ROC year-month', () => {
    expect(rocYearMonth('11508')).toBe('2026-08');
    expect(rocYearMonth('9912')).toBe('2010-12');
    expect(rocYearMonth(undefined)).toBeNull();
  });

  it('reads Google News RSS titles without the trailing source', () => {
    const xml = `<rss><channel>
      <item><title>台積電法說倒數 &amp; 訂單滿載 - Yahoo股市</title><pubDate>Mon, 29 Sep 2026 03:00:00 GMT</pubDate><source url="x">Yahoo股市</source></item>
      <item><title><![CDATA[環球晶(6488) 獲利預估下修 - 工商時報]]></title><source url="y">工商時報</source></item>
    </channel></rss>`;
    expect(parseRssItems(xml)).toEqual([
      { title: '台積電法說倒數 & 訂單滿載', source: 'Yahoo股市', date: '2026-09-29' },
      { title: '環球晶(6488) 獲利預估下修', source: '工商時報', date: null },
    ]);
    expect(parseRssItems(xml, 1)).toHaveLength(1);
  });
});
