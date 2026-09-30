import { IsString, MinLength } from 'class-validator';

export class SetAppleWriteCalendarDto {
  /// 元序新增「存到 iPhone」的行程要寫進哪一個日曆——必須是同步中的其中一個。
  @IsString()
  @MinLength(1)
  writeCalendarUrl: string;
}
