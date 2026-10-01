import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { WishlistService } from './wishlist.service';

class WishlistItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(1)
  price: number;

  @IsOptional()
  @IsIn([1, 2, 3])
  priority?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

class BoughtDto {
  @IsOptional()
  @IsNumber()
  actualPrice?: number;
}

class BudgetDto {
  /** null＝回到預設（平均結餘的 30%）。 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;
}

/** App 財務「購物車」分頁。 */
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly service: WishlistService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user.id);
  }

  @Post()
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: WishlistItemDto) {
    return this.service.add(user.id, dto);
  }

  @Patch('budget')
  setBudget(@CurrentUser() user: AuthenticatedUser, @Body() dto: BudgetDto) {
    return this.service.setMonthlyBudget(user.id, dto.amount ?? null);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: WishlistItemDto) {
    return this.service.update(user.id, id, dto);
  }

  @Post(':id/bought')
  bought(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: BoughtDto) {
    return this.service.markBought(user.id, id, dto.actualPrice);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
