import { IsString, Matches } from 'class-validator';

export class UpdateCalendarShareColorDto {
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'viewerColor 必須是 #RRGGBB 格式的十六進位色碼' })
  viewerColor: string;
}
