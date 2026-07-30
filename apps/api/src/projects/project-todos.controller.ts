import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectTodosService } from './project-todos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateProjectTodoDto } from './dto/create-project-todo.dto';
import { UpdateProjectTodoDto } from './dto/update-project-todo.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/todos')
export class ProjectTodosController {
  constructor(private readonly service: ProjectTodosService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.service.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectTodoDto,
  ) {
    return this.service.create(user.id, projectId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectTodoDto,
  ) {
    return this.service.update(user.id, projectId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(user.id, projectId, id);
  }
}
