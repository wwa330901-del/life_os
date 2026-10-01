import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_SELECT = {
  lineUserId: true,
  morningBriefEnabled: true,
  journalReminderEnabled: true,
  todoReminderEnabled: true,
  reviewEnabled: true,
  goalReminderEnabled: true,
} as const;

export class UpdateReminderSettingsDto {
  @IsOptional() @IsBoolean() morningBriefEnabled?: boolean;
  @IsOptional() @IsBoolean() journalReminderEnabled?: boolean;
  @IsOptional() @IsBoolean() todoReminderEnabled?: boolean;
  @IsOptional() @IsBoolean() reviewEnabled?: boolean;
  @IsOptional() @IsBoolean() goalReminderEnabled?: boolean;
}

/** App「提醒設定」— the same switches LINE's 「關閉早報」etc. flip. Every reminder goes
 * out through LINE, so they live on LineAccountLink; not linked yet → `linked: false`. */
@UseGuards(JwtAuthGuard)
@Controller('line/settings')
export class LineSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    const link = await this.prisma.lineAccountLink.findUnique({ where: { userId: user.id }, select: SETTINGS_SELECT });
    return toResponse(link);
  }

  @Patch()
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateReminderSettingsDto) {
    const link = await this.prisma.lineAccountLink.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...dto },
      update: { ...dto, ...(dto.journalReminderEnabled === false && { journalPromptAt: null }) },
      select: SETTINGS_SELECT,
    });
    return toResponse(link);
  }
}

function toResponse(link: { lineUserId: string | null; morningBriefEnabled: boolean; journalReminderEnabled: boolean; todoReminderEnabled: boolean; reviewEnabled: boolean; goalReminderEnabled: boolean } | null) {
  return {
    linked: link?.lineUserId != null,
    morningBriefEnabled: link?.morningBriefEnabled ?? true,
    journalReminderEnabled: link?.journalReminderEnabled ?? true,
    todoReminderEnabled: link?.todoReminderEnabled ?? true,
    reviewEnabled: link?.reviewEnabled ?? true,
    goalReminderEnabled: link?.goalReminderEnabled ?? true,
  };
}
