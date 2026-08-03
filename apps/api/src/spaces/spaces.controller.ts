import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('spaces')
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Get('me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.spacesService.listForUser(user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.spacesService.getForUserOrThrow(user.id, id);
  }

  @Get(':id/members')
  listMembers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.spacesService.listMembers(user.id, id);
  }

  @Post('calendar')
  getOrCreateCalendarSpace(@CurrentUser() user: AuthenticatedUser) {
    return this.spacesService.getOrCreateCalendarSpace(user.id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.spacesService.remove(user.id, id);
  }
}
