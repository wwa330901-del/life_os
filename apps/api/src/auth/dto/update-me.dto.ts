import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/** App 的 10 套外觀風格（apps/windows_app/lib/core/theme/app_themes.dart 的 id）。 */
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
