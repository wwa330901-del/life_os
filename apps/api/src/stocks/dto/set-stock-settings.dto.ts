import { IsOptional, IsString } from 'class-validator';

export class SetStockSettingsDto {
  /// null＝取消設定。
  @IsOptional()
  @IsString()
  accountId?: string | null;
}
