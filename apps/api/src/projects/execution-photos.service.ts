import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { SupabaseStorageService } from '../knowledge/supabase-storage.service';
import type { ExecutionPhoto } from '../../generated/prisma/client.js';
import { UploadExecutionPhotoDto } from './dto/upload-execution-photo.dto';

/**
 * 執行照片——見 schema.prisma 的 ExecutionPhoto 說明。實際檔案存
 * Supabase Storage（knowledge-media bucket，跟 engineering-finance 的追
 * 加報價單附件共用同一個服務），這裡的資料表只存 storagePath，顯示時
 * 一律現簽 URL（bucket 是 private，不能存永久連結）。
 */
@Injectable()
export class ExecutionPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly storage: SupabaseStorageService,
  ) {}

  /** 每筆都現簽 photoUrl（1 小時內有效）——見 SupabaseStorageService.getSignedUrl. */
  async list(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    const photos = await this.prisma.executionPhoto.findMany({
      where: { projectId },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { photoDate: 'desc' },
    });
    return Promise.all(
      photos.map(async (photo) => ({
        ...photo,
        photoUrl: await this.storage.getSignedUrl(photo.storagePath),
      })),
    );
  }

  async upload(
    userId: string,
    projectId: string,
    dto: UploadExecutionPhotoDto,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('請選擇要上傳的照片');
    if (!this.storage.configured)
      throw new BadRequestException('檔案儲存服務尚未設定');
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);

    const photoId = randomUUID();
    const extension = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'bin';
    const storagePath = `execution-photos/${projectId}/${photoId}.${extension}`;
    await this.storage.upload(
      storagePath,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    const photo = await this.prisma.executionPhoto.create({
      data: {
        id: photoId,
        projectId,
        photoDate: new Date(dto.photoDate),
        caption: dto.caption,
        storagePath,
        uploadedByUserId: userId,
      },
      include: { uploadedBy: { select: { name: true } } },
    });
    return { ...photo, photoUrl: await this.storage.getSignedUrl(storagePath) };
  }

  async remove(userId: string, projectId: string, photoId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    const photo = await this.getPhotoOrThrow(projectId, photoId);
    await this.prisma.executionPhoto.delete({ where: { id: photo.id } });
    if (this.storage.configured) {
      await this.storage.delete(photo.storagePath).catch(() => {
        // 資料庫紀錄已經刪了——Storage 端刪不掉（例如檔案本來就不存在）
        // 不影響使用者體驗，靜默吞掉，同 LineNotifierService 的失敗處理慣例。
      });
    }
  }

  private async getPhotoOrThrow(
    projectId: string,
    photoId: string,
  ): Promise<ExecutionPhoto> {
    const photo = await this.prisma.executionPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.projectId !== projectId) {
      throw new NotFoundException('Execution photo not found');
    }
    return photo;
  }
}
