import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { SpacesModule } from '../spaces/spaces.module';
import { ProjectsModule } from '../projects/projects.module';
import { EngineeringFinanceModule } from '../engineering-finance/engineering-finance.module';

@Module({
  imports: [SpacesModule, ProjectsModule, EngineeringFinanceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
