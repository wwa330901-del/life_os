import { IsString } from 'class-validator';

/// 2026-08-06 起邀請對象必須先是好友——直接吃對方的 userId（從好友列表
/// 選），不再是 email。
export class InviteCalendarShareDto {
  @IsString()
  viewerUserId: string;
}
