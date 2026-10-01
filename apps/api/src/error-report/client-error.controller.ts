import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { ErrorReportService } from './error-report.service';

class ClientErrorDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}

/** App 端沒接住的錯誤（閃退、畫面出錯）回報到這裡，一樣用 LINE 通知管理員。 */
@UseGuards(JwtAuthGuard)
@Controller('client-errors')
export class ClientErrorController {
  constructor(private readonly reporter: ErrorReportService) {}

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async report(@CurrentUser() user: AuthenticatedUser, @Body() dto: ClientErrorDto) {
    await this.reporter.report(`App${dto.appVersion ? ` v${dto.appVersion}` : ''}（使用者 ${user.id.slice(0, 8)}）`, dto.message, dto.stack);
  }
}
