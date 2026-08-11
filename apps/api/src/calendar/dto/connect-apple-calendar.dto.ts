import { ArrayMinSize, IsArray, IsEmail, IsString, MinLength } from 'class-validator';

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
}
