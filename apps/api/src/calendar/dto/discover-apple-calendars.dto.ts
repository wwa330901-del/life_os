import { IsEmail, IsString, MinLength } from 'class-validator';

export class DiscoverAppleCalendarsDto {
  @IsEmail()
  appleId: string;

  /// 一組 App 專用密碼（appleid.apple.com 產生），不是 Apple ID 本身的登入
  /// 密碼——iCloud 帳號全面強制雙重驗證，一般密碼沒辦法直接用在 API 存取。
  @IsString()
  @MinLength(1)
  appPassword: string;
}
