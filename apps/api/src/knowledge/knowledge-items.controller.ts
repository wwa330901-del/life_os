import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { KnowledgeItemsService } from './knowledge-items.service';
import { KnowledgeAnalysisPipeline } from './knowledge-analysis-pipeline.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { AssignKnowledgeItemCategoryDto } from './dto/assign-knowledge-item-category.dto';
import { ReanalyzeKnowledgeItemDto } from './dto/reanalyze-knowledge-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('knowledge/items')
export class KnowledgeItemsController {
  constructor(
    private readonly itemsService: KnowledgeItemsService,
    private readonly analysisPipeline: KnowledgeAnalysisPipeline,
  ) {}

  @Get()
  listOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.itemsService.listOwn(user.id, { categoryId, search, cursor });
  }

  @Get('public')
  listPublic(
    @CurrentUser() user: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.itemsService.listPublicFromOthers(user.id, {
      categoryId,
      ownerUserId,
      search,
      cursor,
    });
  }

  @Get(':itemId')
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.getDetailWithFileUrl(user.id, itemId);
  }

  /// 重新分析 (2026-08-06) — 可選一段額外指示。不用 fire-and-forget（跟
  /// save-copy/LINE 入口不同）：使用者是在看著這則資料的當下主動按的，
  /// 讓 App 端等到分析真的跑完（或失敗）比較符合這個互動的預期，不用另外
  /// 等一則 LINE 推播才知道結果。
  @Post(':itemId/reanalyze')
  reanalyze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: ReanalyzeKnowledgeItemDto,
  ) {
    return this.analysisPipeline.reanalyze(itemId, user.id, dto.instruction);
  }

  @Post(':itemId/save-copy')
  async saveCopy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    const pending = await this.itemsService.saveCopy(user.id, itemId);
    // Fire-and-forget, same as the LINE entry point — completion comes back
    // via a LINE push, not this HTTP response.
    void this.analysisPipeline.processUrlSubmission(
      pending.id,
      user.id,
      pending.sourceUrl!,
    );
    return pending;
  }

  /// 分享 — LINE 沒有開放第三方桌面軟體指定分享給某個朋友的能力，退而求其次
  /// 傳一則含連結的訊息給自己的 LINE，自己再用 LINE 內建轉發功能傳給朋友。
  @Post(':itemId/share')
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.shareToOwnLine(user.id, itemId);
  }

  /// 手動指定分類 — AI 判斷不出來、或內容根本抓不到（例如 Instagram 連結）
  /// 時的備援，不論目前狀態為何都可以呼叫，也可以拿來重新歸類已完成的項目。
  @Patch(':itemId/category')
  assignCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: AssignKnowledgeItemCategoryDto,
  ) {
    return this.itemsService.assignCategory(user.id, itemId, dto.categoryId);
  }

  @Delete(':itemId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    return this.itemsService.remove(user.id, itemId);
  }
}
