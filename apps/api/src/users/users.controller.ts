import {
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/** Minimal cross-account lookup — currently only used by the 知識庫 category
 * blacklist UI ("封鎖某人看到我的公開分類"), which needs to resolve an email
 * to a userId. Returns only non-sensitive display fields. */
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('lookup')
  async lookupByEmail(@Query('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new NotFoundException('找不到這個 email 對應的帳號');
    return { id: user.id, name: user.name, email: user.email };
  }
}
