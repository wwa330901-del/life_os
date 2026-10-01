import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { HealthRecordType } from '../../generated/prisma/client.js';
import { HealthService, HealthRecordInput } from './health.service';
import { HealthRecordDto } from './dto/health-record.dto';

function toInput(dto: HealthRecordDto): HealthRecordInput {
  return {
    type: dto.type,
    date: dto.date,
    startAt: dto.startAt ? new Date(dto.startAt) : undefined,
    endAt: dto.endAt ? new Date(dto.endAt) : undefined,
    minutes: dto.minutes,
    value: dto.value,
    activity: dto.activity,
    note: dto.note,
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  /** iPhone 捷徑 — no login, the private key in the URL (`?key=`) or `Authorization: Bearer` is the auth. */
  @Post('ingest')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  ingest(@Query('key') key: string | undefined, @Headers('authorization') auth: string | undefined, @Body() body: Record<string, unknown>) {
    const token = key || auth?.replace(/^Bearer\s+/i, '') || undefined;
    return this.service.ingest(token, body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('type') type?: HealthRecordType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(user.id, { type: type && type in HealthRecordType ? type : undefined, from, to });
  }

  /** Last `days` days (default 7) incl. today. */
  @UseGuards(JwtAuthGuard)
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.service.statsLastDays(user.id, Number(days) || 7);
  }

  @UseGuards(JwtAuthGuard)
  @Get('ingest-token')
  ingestToken(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getIngestToken(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('ingest-token/regenerate')
  regenerate(@CurrentUser() user: AuthenticatedUser) {
    return this.service.regenerateIngestToken(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: HealthRecordDto) {
    return this.service.create(user.id, toInput(dto));
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: HealthRecordDto) {
    return this.service.update(user.id, id, toInput(dto));
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
