import { ArrayMinSize, IsArray, IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class ConnectAppleCalendarDto {
  @IsEmail()
  appleId: string;

  @IsString()
  @MinLength(1)
  appPassword: string;

  /// 使用者在「發現」步驟看到的日曆清單裡勾選的那幾個 CalDAV 日曆網址。
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  selectedCalendarUrls: string[];

  /// 元序新增「存到 iPhone」的行程要寫進哪一個日曆；不填＝勾選的第一個。
  @IsOptional()
  @IsString()
  writeCalendarUrl?: string;
}
