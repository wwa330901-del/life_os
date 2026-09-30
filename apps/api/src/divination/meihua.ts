import { Solar } from 'lunar-typescript';

/** 梅花易數・時間起卦（2026-10-01）。
 * 年支數＋農曆月＋農曆日 → 上卦；再加時支數 → 下卦；總數除 6 → 動爻。
 * 卦數用先天八卦數（乾1 兌2 離3 震4 巽5 坎6 艮7 坤8，餘 0 當 8）。 */

export interface Trigram {
  name: string;
  image: string;
  element: '金' | '木' | '水' | '火' | '土';
  /** 由下往上，陽爻＝1 */
  lines: [number, number, number];
}

export const TRIGRAMS: Record<number, Trigram> = {
  1: { name: '乾', image: '天', element: '金', lines: [1, 1, 1] },
  2: { name: '兌', image: '澤', element: '金', lines: [1, 1, 0] },
  3: { name: '離', image: '火', element: '火', lines: [1, 0, 1] },
  4: { name: '震', image: '雷', element: '木', lines: [1, 0, 0] },
  5: { name: '巽', image: '風', element: '木', lines: [0, 1, 1] },
  6: { name: '坎', image: '水', element: '水', lines: [0, 1, 0] },
  7: { name: '艮', image: '山', element: '土', lines: [0, 0, 1] },
  8: { name: '坤', image: '地', element: '土', lines: [0, 0, 0] },
};

/** 六十四卦名，[上卦數][下卦數]，順序 乾兌離震巽坎艮坤。 */
const HEXAGRAM_NAMES: string[][] = [
  ['乾為天', '天澤履', '天火同人', '天雷無妄', '天風姤', '天水訟', '天山遯', '天地否'],
  ['澤天夬', '兌為澤', '澤火革', '澤雷隨', '澤風大過', '澤水困', '澤山咸', '澤地萃'],
  ['火天大有', '火澤睽', '離為火', '火雷噬嗑', '火風鼎', '火水未濟', '火山旅', '火地晉'],
  ['雷天大壯', '雷澤歸妹', '雷火豐', '震為雷', '雷風恆', '雷水解', '雷山小過', '雷地豫'],
  ['風天小畜', '風澤中孚', '風火家人', '風雷益', '巽為風', '風水渙', '風山漸', '風地觀'],
  ['水天需', '水澤節', '水火既濟', '水雷屯', '水風井', '坎為水', '水山蹇', '水地比'],
  ['山天大畜', '山澤損', '山火賁', '山雷頤', '山風蠱', '山水蒙', '艮為山', '山地剝'],
  ['地天泰', '地澤臨', '地火明夷', '地雷復', '地風升', '地水師', '地山謙', '坤為地'],
];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const GENERATES: Record<string, string> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<string, string> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export interface Hexagram {
  name: string;
  upper: string;
  lower: string;
}

export interface MeihuaReading {
  lunarDate: string;
  numbers: { year: number; month: number; day: number; hour: number; yearBranch: string; hourBranch: string };
  original: Hexagram;
  mutual: Hexagram;
  changed: Hexagram;
  movingLine: number;
  ti: { trigram: string; element: string };
  yong: { trigram: string; element: string };
  /** 體用關係與吉凶傾向 */
  relation: string;
  /** 體卦在當月的旺衰 */
  season: { monthBranch: string; tiStrength: string };
}

const mod = (n: number, m: number) => n % m || m;

/** 曆法套件輸出的是簡體，這裡只會出現這幾個字。 */
const TRADITIONAL: Record<string, string> = { 龙: '龍', 马: '馬', 鸡: '雞', 猪: '豬', 腊: '臘', 闰: '閏' };
const tw = (text: string) => text.replace(/[龙马鸡猪腊闰]/g, (c) => TRADITIONAL[c]);

function trigramNumber(lines: number[]): number {
  const found = Object.entries(TRIGRAMS).find(([, t]) => t.lines.every((v, i) => v === lines[i]));
  return Number(found![0]);
}

function hexagram(upper: number, lower: number): Hexagram {
  return {
    name: HEXAGRAM_NAMES[upper - 1][lower - 1],
    upper: `${TRIGRAMS[upper].name}（${TRIGRAMS[upper].image}）`,
    lower: `${TRIGRAMS[lower].name}（${TRIGRAMS[lower].image}）`,
  };
}

function relationOf(ti: string, yong: string): string {
  if (ti === yong) return '體用比和：同心協力，事情順利';
  if (GENERATES[yong] === ti) return '用生體：得到外力幫助，大吉';
  if (CONTROLS[ti] === yong) return '體克用：可以成事，但要花力氣，吉';
  if (GENERATES[ti] === yong) return '體生用：付出較多、有耗損，小凶';
  return '用克體：外在阻力大，凶，宜謹慎';
}

/** 月支當令的五行；辰戌丑未屬土。 */
const MONTH_ELEMENT: Record<string, string> = {
  寅: '木', 卯: '木', 巳: '火', 午: '火', 申: '金', 酉: '金', 亥: '水', 子: '水', 辰: '土', 戌: '土', 丑: '土', 未: '土',
};

function strengthOf(element: string, seasonal: string): string {
  if (element === seasonal) return '旺（當令，力量最強）';
  if (GENERATES[seasonal] === element) return '相（得令生扶，有力）';
  if (GENERATES[element] === seasonal) return '休（洩氣，力量普通）';
  if (CONTROLS[element] === seasonal) return '囚（受困，力量弱）';
  return '死（被當令所克，力量最弱）';
}

/** `at` is a real instant; it's converted to Taipei wall-clock time first. */
export function castByTime(at: Date): MeihuaReading {
  const t = new Date(at.getTime() + 8 * 60 * 60 * 1000);
  const lunar = Solar.fromYmdHms(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), 0).getLunar();

  const yearBranch = lunar.getYearZhi();
  const hourBranch = lunar.getTimeZhi();
  const year = BRANCHES.indexOf(yearBranch) + 1;
  const month = Math.abs(lunar.getMonth()); // 閏月是負數
  const day = lunar.getDay();
  const hour = BRANCHES.indexOf(hourBranch) + 1;

  const upper = mod(year + month + day, 8);
  const lower = mod(year + month + day + hour, 8);
  const movingLine = mod(year + month + day + hour, 6);

  const lines = [...TRIGRAMS[lower].lines, ...TRIGRAMS[upper].lines];
  const changedLines = lines.map((v, i) => (i === movingLine - 1 ? 1 - v : v));
  const mutualLower = trigramNumber(lines.slice(1, 4));
  const mutualUpper = trigramNumber(lines.slice(2, 5));

  // 動爻在下卦 → 下卦是用、上卦是體；反之亦然。
  const tiNumber = movingLine <= 3 ? upper : lower;
  const yongNumber = movingLine <= 3 ? lower : upper;
  const ti = TRIGRAMS[tiNumber];
  const yong = TRIGRAMS[yongNumber];
  const monthBranch = lunar.getMonthZhi();

  return {
    lunarDate: tw(`${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${hourBranch}時`),
    numbers: { year, month, day, hour, yearBranch, hourBranch },
    original: hexagram(upper, lower),
    mutual: hexagram(mutualUpper, mutualLower),
    changed: hexagram(trigramNumber(changedLines.slice(3, 6)), trigramNumber(changedLines.slice(0, 3))),
    movingLine,
    ti: { trigram: ti.name, element: ti.element },
    yong: { trigram: yong.name, element: yong.element },
    relation: relationOf(ti.element, yong.element),
    season: { monthBranch, tiStrength: strengthOf(ti.element, MONTH_ELEMENT[monthBranch]) },
  };
}

/** 生辰八字（出生時間不知道就只有年月日三柱）。 */
export function birthChart(birthDate: string, birthTime: string | null) {
  const [y, m, d] = birthDate.split('-').map(Number);
  const [hh, mm] = birthTime ? birthTime.split(':').map(Number) : [12, 0];
  const lunar = Solar.fromYmdHms(y, m, d, hh, mm, 0).getLunar();
  const chart = lunar.getEightChar();
  return {
    lunarBirthday: tw(`${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`),
    zodiac: tw(lunar.getYearShengXiao()),
    pillars: [chart.getYear(), chart.getMonth(), chart.getDay(), ...(birthTime ? [chart.getTime()] : [])].join(' '),
    dayMaster: `${chart.getDayGan()}（${chart.getDayWuXing().charAt(0)}）`,
  };
}
