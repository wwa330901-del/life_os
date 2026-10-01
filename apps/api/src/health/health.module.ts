import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { HealthAiService } from './health-ai.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthAiService],
  // 萬用 AI（記/查健康）、早報（昨晚睡多久）、週/月回顧會用到。
  exports: [HealthService, HealthAiService],
})
export class HealthModule {}
