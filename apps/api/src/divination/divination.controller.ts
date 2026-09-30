import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { DivinationService } from './divination.service';

class SetBirthDto {
  /// YYYY-MM-DD
  @IsString()
  birthDate: string;

  /// HH:mm，不知道就不填
  @IsOptional()
  @IsString()
  birthTime?: string;
}

class CastDto {
  @IsString()
  @MinLength(1)
  question: string;
}

@UseGuards(JwtAuthGuard)
@Controller('divination')
export class DivinationController {
  constructor(private readonly service: DivinationService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user.id);
  }

  @Post('profile')
  setProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetBirthDto) {
    return this.service.setProfile(user.id, dto.birthDate, dto.birthTime ?? null);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }

  @Post('cast')
  cast(@CurrentUser() user: AuthenticatedUser, @Body() dto: CastDto) {
    return this.service.cast(user.id, dto.question);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
