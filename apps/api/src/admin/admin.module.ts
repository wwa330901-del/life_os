import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiUsageAdminService } from './ai-usage-admin.service';
import { UsersModule } from '../users/users.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';

@Module({
  imports: [UsersModule, LineNotifierModule],
  controllers: [AdminController],
  providers: [AdminService, AiUsageAdminService],
  // LINE「AI 用量」（管理員）。
  exports: [AiUsageAdminService],
})
export class AdminModule {}
