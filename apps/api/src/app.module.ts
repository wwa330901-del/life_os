import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { SystemTroubleFilter } from './error-report/system-trouble';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { SpacesModule } from './spaces/spaces.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { FinanceModule } from './finance/finance.module';
import { StocksModule } from './stocks/stocks.module';
import { LineModule } from './line/line.module';
import { CalendarModule } from './calendar/calendar.module';
import { CalendarSharesModule } from './calendar-shares/calendar-shares.module';
import { HomeModule } from './home/home.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { TodosModule } from './todos/todos.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { FriendsModule } from './friends/friends.module';
import { FinanceReportModule } from './finance/finance-report.module';
import { LifeGoalsModule } from './life-goals/life-goals.module';
import { LifeReviewModule } from './life-review/life-review.module';
import { JournalModule } from './journal/journal.module';
import { DailyBriefModule } from './daily-brief/daily-brief.module';
import { DivinationModule } from './divination/divination.module';
import { HealthModule } from './health/health.module';
import { MemoryModule } from './memory/memory.module';
import { ExportModule } from './export/export.module';
import { ErrorReportModule } from './error-report/error-report.module';
import { SecretMigrationService } from './common/secret-migration.service';

@Module({
  imports: [
    // Must come first among imports (Sentry's own requirement) — no-ops
    // when SENTRY_DSN isn't set, see instrument.ts.
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    // 全域預設速率限制（2026-09-29，密碼暴力破解防護）——每個 IP 每分鐘
    // 100 次請求，一般正常使用不會碰到；/auth 底下幾個帳號相關端點另外用
    // @Throttle 收得更緊，見 AuthController。
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    PrismaModule,
    UsersModule,
    SpacesModule,
    AuthModule,
    AdminModule,
    FinanceModule,
    StocksModule,
    LineModule,
    CalendarModule,
    CalendarSharesModule,
    HomeModule,
    KnowledgeModule,
    TodosModule,
    AiAssistantModule,
    FriendsModule,
    FinanceReportModule,
    LifeGoalsModule,
    LifeReviewModule,
    JournalModule,
    DailyBriefModule,
    DivinationModule,
    HealthModule,
    MemoryModule,
    ExportModule,
    ErrorReportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SecretMigrationService,
    // Must be the first APP_FILTER provider (Sentry's own requirement) so
    // it sees every unhandled exception before any other filter can
    // (SystemTroubleFilter extends SentryGlobalFilter; 500 錯誤只給使用者看「已通知管理員」)
    // swallow it.
    { provide: APP_FILTER, useClass: SystemTroubleFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
