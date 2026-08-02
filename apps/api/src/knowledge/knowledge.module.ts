import { Module } from '@nestjs/common';
import { KnowledgeCategoriesController } from './knowledge-categories.controller';
import { KnowledgeItemsController } from './knowledge-items.controller';
import { AiUsageController } from './ai-usage.controller';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import { KnowledgeItemsService } from './knowledge-items.service';
import { AiUsageService } from './ai-usage.service';
import { ContentFetcherService } from './content-fetcher.service';
import { GeminiContentAnalysisService } from './ai/gemini-content-analysis.service';
import { AI_CONTENT_ANALYSIS_SERVICE } from './ai/ai-content-analysis.interface';
import { KnowledgeAnalysisPipeline } from './knowledge-analysis-pipeline.service';
import { KnowledgeExhibitionReminderService } from './knowledge-exhibition-reminder.service';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [LineNotifierModule, UsersModule],
  controllers: [
    KnowledgeCategoriesController,
    KnowledgeItemsController,
    AiUsageController,
  ],
  providers: [
    KnowledgeCategoriesService,
    KnowledgeItemsService,
    AiUsageService,
    ContentFetcherService,
    KnowledgeAnalysisPipeline,
    KnowledgeExhibitionReminderService,
    {
      provide: AI_CONTENT_ANALYSIS_SERVICE,
      useClass: GeminiContentAnalysisService,
    },
  ],
  exports: [
    KnowledgeCategoriesService,
    KnowledgeItemsService,
    KnowledgeAnalysisPipeline,
  ],
})
export class KnowledgeModule {}
