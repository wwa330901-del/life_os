import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectOptionsService } from './project-options.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { ProjectOptionDto } from './dto/project-option.dto';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/project-options')
export class AdminProjectOptionsController {
  constructor(private readonly projectOptionsService: ProjectOptionsService) {}

  @Post('types')
  createType(@Body() dto: ProjectOptionDto) {
    return this.projectOptionsService.createType(dto.label);
  }

  @Patch('types/:id')
  renameType(@Param('id') id: string, @Body() dto: ProjectOptionDto) {
    return this.projectOptionsService.renameType(id, dto.label);
  }

  @Delete('types/:id')
  deleteType(@Param('id') id: string) {
    return this.projectOptionsService.deleteType(id);
  }

  @Post('statuses')
  createStatus(@Body() dto: ProjectOptionDto) {
    return this.projectOptionsService.createStatus(dto.label);
  }

  @Patch('statuses/:id')
  renameStatus(@Param('id') id: string, @Body() dto: ProjectOptionDto) {
    return this.projectOptionsService.renameStatus(id, dto.label);
  }

  @Delete('statuses/:id')
  deleteStatus(@Param('id') id: string) {
    return this.projectOptionsService.deleteStatus(id);
  }
}
