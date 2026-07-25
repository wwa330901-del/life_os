import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SpaceType } from '../../generated/prisma/client.js';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';

/**
 * Platform-admin management of a space's document templates (see
 * DocumentTemplate in schema.prisma). Templates are ingested by hand —
 * reading a dropped-in .docx, tagging its blanks with `{{key}}`, and
 * confirming the resulting field list with the space's owner is a job for
 * a human (well, an AI) — so `create` here is the "save the already-tagged
 * result" step, not a self-service "upload any file" endpoint.
 */
/** Every list/create/update response omits `docxData` — a multi-KB binary
 * blob has no business riding along in a metadata JSON response. The
 * dedicated download endpoint (`ProjectDocumentsController`) is the only
 * place that returns the raw bytes. */
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

@Injectable()
export class DocumentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(spaceId: string) {
    await this.getSpaceOrThrow(spaceId);
    return this.prisma.documentTemplate.findMany({
      where: { spaceId },
      orderBy: { code: 'asc' },
      select: metadataSelect,
    });
  }

  async create(
    spaceId: string,
    dto: CreateDocumentTemplateDto,
    file: Express.Multer.File,
  ) {
    await this.getSpaceOrThrow(spaceId);
    if (!file) {
      throw new BadRequestException('缺少文件檔案');
    }
    return this.prisma.documentTemplate.create({
      data: {
        spaceId,
        code: dto.code,
        name: dto.name,
        category: dto.category,
        docxData: new Uint8Array(file.buffer),
        fields: this.parseJsonArray(
          dto.fields,
          'fields',
        ) as Prisma.InputJsonValue,
        allowedTypeOptionIds: this.parseJsonArray(
          dto.allowedTypeOptionIds,
          'allowedTypeOptionIds',
        ) as string[],
      },
      select: metadataSelect,
    });
  }

  async update(id: string, dto: UpdateDocumentTemplateDto) {
    await this.getOrThrow(id);
    return this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.fields !== undefined && {
          fields: dto.fields as Prisma.InputJsonValue,
        }),
        ...(dto.allowedTypeOptionIds !== undefined && {
          allowedTypeOptionIds: dto.allowedTypeOptionIds,
        }),
      },
      select: metadataSelect,
    });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.documentTemplate.delete({ where: { id } });
  }

  private async getSpaceOrThrow(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space || space.type !== SpaceType.COMPANY) {
      throw new NotFoundException('Company space not found');
    }
    return space;
  }

  private async getOrThrow(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Document template not found');
    }
    return template;
  }

  private parseJsonArray(raw: string, fieldName: string): unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException(`${fieldName} 格式錯誤，需為 JSON 陣列`);
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException(`${fieldName} 格式錯誤，需為 JSON 陣列`);
    }
    return parsed;
  }
}
