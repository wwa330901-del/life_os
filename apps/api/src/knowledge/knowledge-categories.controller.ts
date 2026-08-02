import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateKnowledgeCategoryDto } from './dto/create-knowledge-category.dto';
import { UpdateKnowledgeCategoryDto } from './dto/update-knowledge-category.dto';
import {
  KnowledgeFieldDto,
  UpdateKnowledgeFieldDto,
} from './dto/knowledge-field.dto';
import { AddBlacklistEntryDto } from './dto/add-blacklist-entry.dto';

@UseGuards(JwtAuthGuard)
@Controller('knowledge/categories')
export class KnowledgeCategoriesController {
  constructor(private readonly categoriesService: KnowledgeCategoriesService) {}

  @Get()
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.listOwn(user.id);
  }

  @Get('public')
  listPublic(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.listPublicFromOthers(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateKnowledgeCategoryDto,
  ) {
    return this.categoriesService.create(user.id, dto);
  }

  /// 一鍵套用建議分類 — opt-in only, idempotent (skips any name the user
  /// already has). Returns how many were actually created.
  @Post('seed-defaults')
  async seedDefaults(@CurrentUser() user: AuthenticatedUser) {
    const created = await this.categoriesService.seedDefaults(user.id);
    return { created };
  }

  @Patch(':categoryId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateKnowledgeCategoryDto,
  ) {
    return this.categoriesService.update(user.id, categoryId, dto);
  }

  @Delete(':categoryId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
  ) {
    return this.categoriesService.remove(user.id, categoryId);
  }

  @Post(':categoryId/fields')
  addField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Body() dto: KnowledgeFieldDto,
  ) {
    return this.categoriesService.addField(user.id, categoryId, dto);
  }

  @Patch(':categoryId/fields/:fieldId')
  renameField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateKnowledgeFieldDto,
  ) {
    return this.categoriesService.renameField(
      user.id,
      categoryId,
      fieldId,
      dto,
    );
  }

  @Delete(':categoryId/fields/:fieldId')
  removeField(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.categoriesService.removeField(user.id, categoryId, fieldId);
  }

  @Post(':categoryId/blacklist')
  addToBlacklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Body() dto: AddBlacklistEntryDto,
  ) {
    return this.categoriesService.addToBlacklist(
      user.id,
      categoryId,
      dto.email,
    );
  }

  @Delete(':categoryId/blacklist/:blockedUserId')
  removeFromBlacklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('categoryId') categoryId: string,
    @Param('blockedUserId') blockedUserId: string,
  ) {
    return this.categoriesService.removeFromBlacklist(
      user.id,
      categoryId,
      blockedUserId,
    );
  }
}
