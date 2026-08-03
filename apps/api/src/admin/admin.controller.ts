import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateSpaceDto } from './dto/create-space.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers() {
    return this.adminService.listUsers();
  }

  @Get('spaces')
  listSpaces() {
    return this.adminService.listSpaces();
  }

  @Get('spaces/:id')
  getSpace(@Param('id') id: string) {
    return this.adminService.getSpaceDetail(id);
  }

  @Post('spaces')
  createSpace(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSpaceDto) {
    return this.adminService.createCompanySpace(user.id, dto.name);
  }

  @Post('spaces/:id/members')
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.adminService.addMember(id, dto.username, dto.role);
  }

  @Patch('spaces/:id/members/:userId')
  updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.adminService.updateMemberRole(id, userId, dto.role);
  }

  @Delete('spaces/:id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    return this.adminService.removeMember(id, userId);
  }
}
