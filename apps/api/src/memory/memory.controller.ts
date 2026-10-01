import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { MemoryService } from './memory.service';

class MemoryDto {
  @IsString()
  @MinLength(1)
  content: string;
}

class ImportantDateDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsInt()
  @Min(1)
  @Max(31)
  day: number;

  @IsOptional()
  @IsInt()
  year?: number | null;

  @IsOptional()
  @IsBoolean()
  isLunar?: boolean;

  @IsOptional()
  @IsString()
  note?: string | null;
}

/** App「AI 記得的事」頁：看/改/刪 AI 記住的事和重要日子（新增主要靠跟 AI 講）。 */
@UseGuards(JwtAuthGuard)
@Controller()
export class MemoryController {
  constructor(private readonly service: MemoryService) {}

  @Get('memories')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMemories(user.id);
  }

  @Post('memories')
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: MemoryDto) {
    return this.service.remember(user.id, dto.content);
  }

  @Patch('memories/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MemoryDto) {
    return this.service.remember(user.id, dto.content, id);
  }

  @Delete('memories/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.forget(user.id, id);
  }

  @Get('important-dates')
  listDates(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listDates(user.id);
  }

  @Post('important-dates')
  addDate(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportantDateDto) {
    return this.service.addDate(user.id, dto);
  }

  @Patch('important-dates/:id')
  updateDate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ImportantDateDto) {
    return this.service.updateDate(user.id, id, dto);
  }

  @Delete('important-dates/:id')
  removeDate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.deleteDate(user.id, id);
  }
}
