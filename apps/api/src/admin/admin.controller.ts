import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AiUsageAdminService } from './ai-usage-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly aiUsageAdmin: AiUsageAdminService,
  ) {}

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  /** 所有使用者的 AI 用量（今天/近 7 天/本月、各人、各功能、14 天趨勢、最近失敗）。 */
  @Get('ai-usage')
  aiUsage() {
    return this.aiUsageAdmin.overview();
  }
}
