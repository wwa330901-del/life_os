import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { SpacesModule } from './spaces/spaces.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ProjectsModule } from './projects/projects.module';
import { DocumentsModule } from './documents/documents.module';
import { DocumentApprovalsModule } from './document-approvals/document-approvals.module';
import { FinanceModule } from './finance/finance.module';
import { StocksModule } from './stocks/stocks.module';
import { LineModule } from './line/line.module';
import { CalendarModule } from './calendar/calendar.module';
import { CalendarSharesModule } from './calendar-shares/calendar-shares.module';
import { HomeModule } from './home/home.module';
import { ProjectDigestModule } from './project-digest/project-digest.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { TodosModule } from './todos/todos.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    SpacesModule,
    AuthModule,
    AdminModule,
    ProjectsModule,
    DocumentsModule,
    DocumentApprovalsModule,
    FinanceModule,
    StocksModule,
    LineModule,
    CalendarModule,
    CalendarSharesModule,
    HomeModule,
    ProjectDigestModule,
    KnowledgeModule,
    TodosModule,
    AiAssistantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
