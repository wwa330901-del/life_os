import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/** App 的外觀風格（經典 10＋純色 10＋真實 15）（apps/windows_app/lib/core/theme/app_themes.dart 的 id）。 */
export const APP_THEME_IDS = [
  'dawn',
  'ink-gold',
  'paper',
  'forest',
  'ocean',
  'sakura',
  'night',
  'nordic',
  'retro',
  'candy',
  // 2026-11-22 純色系列
  'cloud',
  'graphite',
  'mist-blue',
  'sage',
  'milk-tea',
  'lavender',
  'coral',
  'lemon',
  'midnight',
  'cocoa',
  // 2026-11-22 真實系列
  'p-clouds',
  'p-coast',
  'p-boardwalk',
  'p-city',
  'p-galaxy',
  'p-sakura',
  'p-snowpeak',
  'p-dunes',
  'p-moraine',
  'p-fuji',
  'p-bookstore',
  'p-waterfall',
  'p-maple',
  'p-lavender',
  'p-aurora',
] as const;

/** App 的 3 種版面：cards＝功能卡片、sidebar＝左邊選單、ai＝AI 優先。 */
export const APP_LAYOUT_IDS = ['cards', 'sidebar', 'ai'] as const;

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsIn(APP_THEME_IDS)
  appTheme?: string;

  @IsOptional()
  @IsIn(APP_LAYOUT_IDS)
  appLayout?: string;
}
