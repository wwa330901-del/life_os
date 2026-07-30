import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { FinanceModule } from '../finance/finance.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [ProjectsModule, FinanceModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
