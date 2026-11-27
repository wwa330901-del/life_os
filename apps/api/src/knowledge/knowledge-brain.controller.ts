import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { KnowledgeBrainService } from './knowledge-brain.service';
import { KnowledgeAnalysisPipeline } from './knowledge-analysis-pipeline.service';
import { MergeKnowledgeTopicDto, RenameKnowledgeTopicDto, SetKnowledgeReadDto } from './dto/knowledge-brain.dto';

/** 知識庫大腦（2026-11-27）：首頁、大腦地圖、相關的、看過沒看過、主題管理。 */
@UseGuards(JwtAuthGuard)
@Controller('knowledge/brain')
export class KnowledgeBrainController {
  constructor(
    private readonly brain: KnowledgeBrainService,
    private readonly pipeline: KnowledgeAnalysisPipeline,
  ) {}

  /** 整理舊收藏：背景跑，做完 LINE 通知。 */
  @Post('organize')
  async organize(@CurrentUser() user: AuthenticatedUser) {
    try {
      return await this.pipeline.organizeOld(user.id);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '整理失敗');
    }
  }

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.brain.overview(user.id);
  }

  @Get('graph')
  graph(@CurrentUser() user: AuthenticatedUser) {
    return this.brain.graph(user.id);
  }

  @Get('items/:id/connections')
  connections(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.brain.connections(user.id, id);
  }

  @Post('items/:id/read')
  setRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetKnowledgeReadDto) {
    return this.brain.setRead(user.id, id, dto.read);
  }

  @Get('topics/:id')
  topic(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.brain.topicItems(user.id, id);
  }

  @Patch('topics/:id')
  rename(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: RenameKnowledgeTopicDto) {
    return this.brain.renameTopic(user.id, id, dto.name);
  }

  @Post('topics/:id/merge')
  merge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MergeKnowledgeTopicDto) {
    return this.brain.mergeTopics(user.id, id, dto.targetTopicId);
  }

  @Delete('topics/:id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.brain.deleteTopic(user.id, id);
    return { ok: true };
  }
}
