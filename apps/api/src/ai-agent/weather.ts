/** 天氣（2026-10-02）：使用者問才查，不推播。Open-Meteo 免費、免金鑰；
 * 它的中文地名搜尋幾乎找不到台灣的地方，所以經緯度由 AI 自己給。 */

export const WEATHER_TOOL = {
  type: 'function' as const,
  name: 'get_weather',
  description:
    '查天氣：現在的溫度、體感、天氣狀況，加上今天起 3 天的高低溫和降雨機率、今天接下來每 3 小時的降雨機率。latitude/longitude 你自己填該地點的經緯度；使用者沒講地點就用你記得他住/上班的地方，都不知道就用台北（25.04, 121.56）。',
  parameters: {
    type: 'object',
    properties: {
      placeName: { type: 'string', description: '地點名稱，回覆時用' },
      latitude: { type: 'number' },
      longitude: { type: 'number' },
    },
    required: ['placeName', 'latitude', 'longitude'],
  },
};

const WMO: Record<number, string> = {
  0: '晴',
  1: '大致晴朗',
  2: '多雲時晴',
  3: '陰',
  45: '有霧',
  48: '有霧',
  51: '毛毛雨',
  53: '毛毛雨',
  55: '毛毛雨',
  56: '凍毛毛雨',
  57: '凍毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '凍雨',
  67: '凍雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '冰粒',
  80: '短暫陣雨',
  81: '陣雨',
  82: '強陣雨',
  85: '陣雪',
  86: '大陣雪',
  95: '雷雨',
  96: '雷雨夾冰雹',
  99: '強雷雨夾冰雹',
};

export const weatherLabel = (code: number) => WMO[code] ?? `天氣代碼 ${code}`;

interface ForecastResponse {
  current?: { time: string; temperature_2m: number; apparent_temperature: number; weather_code: number; precipitation: number };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
  hourly?: { time: string[]; precipitation_probability: (number | null)[] };
}

export async function getWeather(placeName: string, latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('經緯度不對');
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    '&current=temperature_2m,apparent_temperature,weather_code,precipitation' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&hourly=precipitation_probability&timezone=Asia%2FTaipei&forecast_days=3';
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`天氣資料暫時拿不到（${res.status}）`);
  return summarizeWeather(placeName, (await res.json()) as ForecastResponse);
}

/** Exposed for tests: trims the raw forecast to what the model needs. */
export function summarizeWeather(placeName: string, body: ForecastResponse) {
  const c = body.current;
  const d = body.daily;
  const now = c?.time ?? '';
  const today = now.slice(0, 10);
  const hourly = body.hourly;
  const nextHours = hourly
    ? hourly.time
        .map((t, i) => ({ t, p: hourly.precipitation_probability[i] }))
        .filter((h) => h.t.startsWith(today) && h.t >= now.slice(0, 13) && Number(h.t.slice(11, 13)) % 3 === 0)
        .map((h) => `${h.t.slice(11, 16)} ${h.p ?? '?'}%`)
    : [];
  return {
    place: placeName,
    now: c
      ? { time: now.slice(11, 16), weather: weatherLabel(c.weather_code), temp: c.temperature_2m, feelsLike: c.apparent_temperature, rainingMm: c.precipitation }
      : null,
    days: d
      ? d.time.map((date, i) => ({
          date,
          weather: weatherLabel(d.weather_code[i]),
          high: d.temperature_2m_max[i],
          low: d.temperature_2m_min[i],
          rainChance: d.precipitation_probability_max[i],
        }))
      : [],
    todayRainChanceByHour: nextHours,
  };
}
