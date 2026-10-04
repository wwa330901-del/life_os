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

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  name?: string;

  @IsOptional()
  @IsIn(APP_THEME_IDS)
  appTheme?: string;
}
