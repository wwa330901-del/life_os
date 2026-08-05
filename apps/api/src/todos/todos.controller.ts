import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TodosService } from './todos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@UseGuards(JwtAuthGuard)
@Controller('todos')
export class TodosController {
  constructor(private readonly service: TodosService) {}

  @Get()
  listAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listAll(user.id);
  }

  @Get('completed')
  listCompleted(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.listCompleted(user.id, { search, cursor });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTodoDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
