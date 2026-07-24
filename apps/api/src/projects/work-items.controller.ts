import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { WorkItemsService } from './work-items.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import { ReorderWorkItemDto } from './dto/reorder-work-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/work-items')
export class WorkItemsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.workItemsService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateWorkItemDto,
  ) {
    return this.workItemsService.create(user.id, projectId, dto);
  }

  @Patch(':workItemId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('workItemId') workItemId: string,
    @Body() dto: UpdateWorkItemDto,
  ) {
    return this.workItemsService.update(user.id, projectId, workItemId, dto);
  }

  @Delete(':workItemId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('workItemId') workItemId: string,
  ) {
    return this.workItemsService.remove(user.id, projectId, workItemId);
  }

  @Patch(':workItemId/reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('workItemId') workItemId: string,
    @Body() dto: ReorderWorkItemDto,
  ) {
    return this.workItemsService.reorder(user.id, projectId, workItemId, dto);
  }
}
