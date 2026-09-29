import { Module } from '@nestjs/common';
import { LifeGoalsController } from './life-goals.controller';
import { LifeGoalsService } from './life-goals.service';

@Module({
  controllers: [LifeGoalsController],
  providers: [LifeGoalsService],
  exports: [LifeGoalsService],
})
export class LifeGoalsModule {}
