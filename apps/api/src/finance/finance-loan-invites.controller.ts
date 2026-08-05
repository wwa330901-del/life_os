import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FinanceLoansService } from './finance-loans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

/// 借出/借入互通的「我收到的邀請」——不像 `FinanceLoansController` 那樣掛在
/// 某個 spaceId 底下，因為接受邀請是「在我自己的個人空間建立一筆對應紀
/// 錄」，呼叫者自己是誰就決定了要用哪個空間，不需要（也不該讓）呼叫端指
/// 定。跟 `CalendarSharesController` 同樣的頂層、跨空間路由風格。
@UseGuards(JwtAuthGuard)
@Controller('finance-loan-invites')
export class FinanceLoanInvitesController {
  constructor(private readonly service: FinanceLoansService) {}

  @Get('received')
  listReceived(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listReceivedInvites(user.id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.acceptInvite(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.removeInvite(user.id, id);
  }
}
