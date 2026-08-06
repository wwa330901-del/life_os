import { Module } from '@nestjs/common';
import { KnowledgeCategoriesController } from './knowledge-categories.controller';
import { KnowledgeItemsController } from './knowledge-items.controller';
import { AiUsageController } from './ai-usage.controller';
import { KnowledgeCategoriesService } from './knowledge-categories.service';
import { KnowledgeItemsService } from './knowledge-items.service';
import { AiUsageService } from './ai-usage.service';
import { ContentFetcherService } from './content-fetcher.service';
import { InstagramFetcherService } from './instagram-fetcher.service';
import { GeminiContentAnalysisService } from './ai/gemini-content-analysis.service';
import { AI_CONTENT_ANALYSIS_SERVICE } from './ai/ai-content-analysis.interface';
import { KnowledgeAnalysisPipeline } from './knowledge-analysis-pipeline.service';
import { KnowledgeExhibitionReminderService } from './knowledge-exhibition-reminder.service';
import { SupabaseStorageService } from './supabase-storage.service';
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
    InstagramFetcherService,
    KnowledgeAnalysisPipeline,
    KnowledgeExhibitionReminderService,
    SupabaseStorageService,
    {
      provide: AI_CONTENT_ANALYSIS_SERVICE,
      useClass: GeminiContentAnalysisService,
    },
  ],
  exports: [
    KnowledgeCategoriesService,
    KnowledgeItemsService,
    KnowledgeAnalysisPipeline,
    InstagramFetcherService,
    // `feature` on AiUsageLog is a plain string specifically so a later,
    // non-知識庫 AI feature could log through the same table — AiAssistant
    // (元序 AI 問答) is the first one to actually do it.
    AiUsageService,
  ],
})
export class KnowledgeModule {}
