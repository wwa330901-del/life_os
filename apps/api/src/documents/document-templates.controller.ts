import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentTemplatesService } from './document-templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/spaces/:spaceId/document-templates')
export class DocumentTemplatesController {
  constructor(private readonly templatesService: DocumentTemplatesService) {}

  @Get()
  list(@Param('spaceId') spaceId: string) {
    return this.templatesService.list(spaceId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateDocumentTemplateDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.templatesService.create(spaceId, dto, file);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }
}
