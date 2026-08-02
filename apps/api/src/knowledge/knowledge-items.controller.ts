import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { KnowledgeItemsService } from './knowledge-items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('knowledge/items')
export class KnowledgeItemsController {
  constructor(private readonly itemsService: KnowledgeItemsService) {}

  @Get()
  listOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.itemsService.listOwn(user.id, { categoryId, search });
  }

  @Get('public')
  listPublic(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('search') search?: string,
  ) {
    return this.itemsService.listPublicFromOthers(user.id, {
      categoryId,
      ownerUserId,
      search,
    });
  }

  @Get(':itemId')
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.getDetail(user.id, itemId);
  }

  @Post(':itemId/save-copy')
  saveCopy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.saveCopy(user.id, itemId);
  }

  /// 分享 — LINE 沒有開放第三方桌面軟體指定分享給某個朋友的能力，退而求其次
  /// 傳一則含連結的訊息給自己的 LINE，自己再用 LINE 內建轉發功能傳給朋友。
  @Post(':itemId/share')
  share(@CurrentUser() user: AuthenticatedUser, @Param('itemId') itemId: string) {
    return this.itemsService.shareToOwnLine(user.id, itemId);
  }

  @Delete(':itemId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.remove(user.id, itemId);
  }
}
