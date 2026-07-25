import { Injectable, NotFoundException } from '@nestjs/common';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { FillDocumentDto } from './dto/fill-document.dto';

const metadataSelect = {
  id: true,
  spaceId: true,
  code: true,
  name: true,
  category: true,
  fields: true,
  allowedTypeOptionIds: true,
  createdAt: true,
} as const;

/**
 * Project-facing side of the document-template system: which templates a
 * project may use (based on its own "類型" property value) and generating
 * a filled copy of one. Filling happens here (server-side, via
 * docxtemplater) rather than on the client — docxtemplater specifically
 * handles the common docx gotcha where Word splits one piece of visible
 * text across several `<w:r>` runs, which a naive client-side string
 * replace would miss.
 */
@Injectable()
export class ProjectDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listForProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const typeOptionId = project.propertyValues.find(
      (v) => v.definition.name === '類型',
    )?.optionId;
    if (!typeOptionId) return [];

    return this.prisma.documentTemplate.findMany({
      where: {
        spaceId: project.spaceId,
        allowedTypeOptionIds: { has: typeOptionId },
      },
      orderBy: { code: 'asc' },
      select: metadataSelect,
    });
  }

  async fill(
    userId: string,
    projectId: string,
    templateId: string,
    dto: FillDocumentDto,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template || template.spaceId !== project.spaceId) {
      throw new NotFoundException('Document template not found');
    }

    const zip = new PizZip(template.docxData);
    // `{{key}}` (not docxtemplater's own single-brace `{key}` default) —
    // matches the tagging convention used when ingesting each template, and
    // avoids colliding with a literal "{"/"}" that might appear in contract
    // text.
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render(dto.values);
    const buffer = doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;

    return { filename: `${template.name}.docx`, buffer };
  }
}
