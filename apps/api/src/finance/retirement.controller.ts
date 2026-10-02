import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { RetirementService } from './retirement.service';

/** 範圍檢查在 validateRetirementPatch（中文錯誤訊息）；null＝改回自動。 */
class RetirementSettingsDto {
  @IsOptional() @IsNumber() retireAge?: number;
  @IsOptional() @IsNumber() lifeExpectancy?: number;
  @IsOptional() @IsNumber() returnRate?: number;
  @IsOptional() @IsNumber() inflation?: number;
  @IsOptional() @IsNumber() pensionMonthly?: number;
  @IsOptional() @IsNumber() pensionStartAge?: number;
  @IsOptional() @IsNumber() monthlyExpense?: number | null;
  @IsOptional() @IsNumber() monthlySaving?: number | null;
  @IsOptional() @IsNumber() age?: number | null;
}

/** App 財務「退休」分頁。 */
@UseGuards(JwtAuthGuard)
@Controller('retirement')
export class RetirementController {
  constructor(private readonly service: RetirementService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.forUser(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: RetirementSettingsDto) {
    return this.service.updateSettings(user.id, dto);
  }
}
