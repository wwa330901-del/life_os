import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DivinationController } from './divination.controller';
import { DivinationService } from './divination.service';
import { DivinationAiService } from './divination-ai.service';
import { DivinationFeedbackService } from './divination-feedback.service';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';

@Module({
  // KnowledgeModule for AiUsageService.
  imports: [KnowledgeModule, LineNotifierModule],
  controllers: [DivinationController],
  providers: [DivinationService, DivinationAiService, DivinationFeedbackService],
  exports: [DivinationAiService],
})
export class DivinationModule {}
