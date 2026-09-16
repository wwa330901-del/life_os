import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExecutionPhotosService } from './execution-photos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { UploadExecutionPhotoDto } from './dto/upload-execution-photo.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/execution-photos')
export class ExecutionPhotosController {
  constructor(
    private readonly executionPhotosService: ExecutionPhotosService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.executionPhotosService.list(user.id, projectId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: UploadExecutionPhotoDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.executionPhotosService.upload(user.id, projectId, dto, file);
  }

  @Delete(':photoId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.executionPhotosService.remove(user.id, projectId, photoId);
  }
}
