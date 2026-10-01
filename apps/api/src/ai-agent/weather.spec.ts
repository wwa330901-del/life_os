import { summarizeWeather } from './weather';

describe('summarizeWeather', () => {
  it('keeps current, 3 days and the rest of today every 3 hours', () => {
    const hours = Array.from({ length: 48 }, (_, i) => `2026-10-0${2 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`);
    const s = summarizeWeather('台北', {
      current: { time: '2026-10-02T10:15', temperature_2m: 28, apparent_temperature: 32, weather_code: 61, precipitation: 0.4 },
      daily: {
        time: ['2026-10-02', '2026-10-03'],
        weather_code: [61, 2],
        temperature_2m_max: [30, 29],
        temperature_2m_min: [24, 23],
        precipitation_probability_max: [80, 10],
      },
      hourly: { time: hours, precipitation_probability: hours.map((_, i) => i) },
    });
    expect(s.now).toEqual({ time: '10:15', weather: '小雨', temp: 28, feelsLike: 32, rainingMm: 0.4 });
    expect(s.days[0]).toEqual({ date: '2026-10-02', weather: '小雨', high: 30, low: 24, rainChance: 80 });
    expect(s.todayRainChanceByHour).toEqual(['12:00 12%', '15:00 15%', '18:00 18%', '21:00 21%']);
  });
});
