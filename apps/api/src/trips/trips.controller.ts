import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CalendarSyncTarget } from '../../generated/prisma/client.js';
import { TripsService } from './trips.service';
import type { ItineraryDay, TripBudget } from './trip';

class CreateTripDto {
  @IsString() @MinLength(1) destination: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsNumber() @Min(1) travelers?: number;
  @IsOptional() @IsString() style?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  /** false＝不用 AI，只存基本資料。 */
  @IsOptional() @IsBoolean() plan?: boolean;
}

class UpdateTripDto {
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber() @Min(1) travelers?: number;
  @IsOptional() @IsString() style?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsObject() budget?: Partial<TripBudget>;
  @IsOptional() @IsArray() itinerary?: ItineraryDay[];
}

class PackingItemDto {
  @IsString() item: string;
  @IsBoolean() packed: boolean;
}

class PackingListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackingItemDto)
  items: PackingItemDto[];
}

class CalendarDto {
  @IsOptional() @IsIn(['GOOGLE', 'ICLOUD']) target?: CalendarSyncTarget;
}

/** App 側欄「旅行」。 */
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly service: TripsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }

  /** 新增旅行時「放進行事曆」要選哪一邊。 */
  @Get('calendar-targets')
  async calendarTargets(@CurrentUser() user: AuthenticatedUser) {
    return { targets: (await this.service.calendarTargets(user.id)).targets };
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    const { plan, ...input } = dto;
    return this.service.create(user.id, { ...input, startDate: input.startDate.slice(0, 10), endDate: input.endDate.slice(0, 10) }, plan !== false);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.service.update(user.id, id, {
      ...dto,
      ...(dto.startDate && { startDate: dto.startDate.slice(0, 10) }),
      ...(dto.endDate && { endDate: dto.endDate.slice(0, 10) }),
    });
  }

  @Post(':id/replan')
  replan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.replan(user.id, id);
  }

  @Patch(':id/packing')
  packing(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: PackingListDto) {
    return this.service.setPackingList(user.id, id, dto.items);
  }

  @Post(':id/calendar')
  calendar(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CalendarDto) {
    return this.service.addToCalendar(user.id, id, dto.target ?? null);
  }

  @Post(':id/save')
  save(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.saveFor(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
