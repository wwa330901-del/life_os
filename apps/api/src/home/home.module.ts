import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { FinanceModule } from '../finance/finance.module';
import { StocksModule } from '../stocks/stocks.module';
import { DocumentApprovalsModule } from '../document-approvals/document-approvals.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [ProjectsModule, FinanceModule, StocksModule, DocumentApprovalsModule],
  controllers: [HomeController],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
