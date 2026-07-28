import {
  Controller,
  Body,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ProjectDocumentsService } from './project-documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { FillDocumentDto } from './dto/fill-document.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/document-templates')
export class ProjectDocumentsController {
  constructor(
    private readonly projectDocumentsService: ProjectDocumentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectDocumentsService.listForProject(user.id, projectId);
  }

  /// Fills the template and persists the result as a `GeneratedDocument`
  /// — returns its metadata (not the rendered file itself); see
  /// `ProjectDocumentsController` below for listing/downloading it
  /// afterward.
  @Post(':templateId/fill')
  fill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('templateId') templateId: string,
    @Body() dto: FillDocumentDto,
  ) {
    return this.projectDocumentsService.fill(user.id, projectId, templateId, dto);
  }
}

/// Project-facing access to already-generated documents (the persisted
/// result of `ProjectDocumentsController.fill` above) — a separate
/// `projects/:projectId/documents` route so a project's "已產生的文件" list
/// reads as its own resource, distinct from the template catalogue it was
/// generated from.
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/documents')
export class GeneratedDocumentsController {
  constructor(
    private readonly projectDocumentsService: ProjectDocumentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectDocumentsService.listGenerated(user.id, projectId);
  }

  @Get(':id/download')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    const { filename, buffer } = await this.projectDocumentsService.downloadGenerated(
      user.id,
      projectId,
      id,
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.projectDocumentsService.removeGenerated(user.id, projectId, id);
  }
}
