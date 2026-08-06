import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { InviteFriendDto } from './dto/invite-friend.dto';

@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private readonly service: FriendsService) {}

  @Get()
  listFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listFriends(user.id);
  }

  @Get('received')
  listReceivedInvites(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listReceivedInvites(user.id);
  }

  @Get('sent')
  listSentInvites(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listSentInvites(user.id);
  }

  @Post('invite')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteFriendDto) {
    return this.service.invite(user.id, dto.email);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.accept(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
