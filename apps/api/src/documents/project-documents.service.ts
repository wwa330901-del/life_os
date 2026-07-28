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

/// Every list/get response omits `docxData` — same reasoning as
/// DocumentTemplate's own `metadataSelect`, a multi-KB binary blob has no
/// business riding along in a metadata JSON response. The dedicated
/// `download` endpoint is the only place that returns the raw bytes.
const generatedMetadataSelect = {
  id: true,
  projectId: true,
  templateId: true,
  name: true,
  values: true,
  createdAt: true,
  createdByUserId: true,
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

  /**
   * Renders the template and persists the result as a `GeneratedDocument`
   * row — filling out a document used to be a one-shot action (render,
   * stream the bytes back, forget it ever happened); now it becomes a
   * record the project keeps, so it can be listed/reopened later and,
   * eventually, routed through a company approval/sign-off workflow that
   * needs something stateful to attach to. Returns metadata only —
   * `docxData` is fetched separately via `download`, same reasoning as
   * `DocumentTemplate` never inlining its own bytes into list responses.
   */
  async fill(
    userId: string,
    projectId: string,
    templateId: string,
    dto: FillDocumentDto,
  ) {
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

    return this.prisma.generatedDocument.create({
      data: {
        spaceId: project.spaceId,
        projectId,
        templateId,
        name: dto.name?.trim() || template.name,
        values: dto.values,
        docxData: new Uint8Array(buffer),
        createdByUserId: userId,
      },
      select: generatedMetadataSelect,
    });
  }

  async listGenerated(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    return this.prisma.generatedDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: generatedMetadataSelect,
    });
  }

  async downloadGenerated(userId: string, projectId: string, id: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const doc = await this.prisma.generatedDocument.findUnique({ where: { id } });
    if (!doc || doc.projectId !== projectId) {
      throw new NotFoundException('Generated document not found');
    }
    return { filename: `${doc.name}.docx`, buffer: Buffer.from(doc.docxData) };
  }
}
