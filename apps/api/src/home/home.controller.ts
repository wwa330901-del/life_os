import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { HomeService } from './home.service';
import { UpdateHomeLayoutDto } from './dto/update-home-layout.dto';

@UseGuards(JwtAuthGuard)
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.homeService.getDashboard(user.id);
  }

  @Get('layout')
  getLayout(@CurrentUser() user: AuthenticatedUser) {
    return this.homeService.getLayout(user.id);
  }

  @Put('layout')
  async setLayout(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateHomeLayoutDto) {
    await this.homeService.setLayout(user.id, dto);
    return this.homeService.getLayout(user.id);
  }
}
