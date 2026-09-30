import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DivinationController } from './divination.controller';
import { DivinationService } from './divination.service';
import { DivinationAiService } from './divination-ai.service';

@Module({
  // KnowledgeModule for AiUsageService.
  imports: [KnowledgeModule],
  controllers: [DivinationController],
  providers: [DivinationService, DivinationAiService],
  exports: [DivinationAiService],
})
export class DivinationModule {}
