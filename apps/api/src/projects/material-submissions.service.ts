import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { MaterialSubmissionStatus } from '../../generated/prisma/client.js';
import type { MaterialSubmission } from '../../generated/prisma/client.js';
import { CreateMaterialSubmissionDto } from './dto/create-material-submission.dto';
import { ReviewMaterialSubmissionDto } from './dto/review-material-submission.dto';

/**
 * 材料送審——見 schema.prisma 的 MaterialSubmission 說明。跟
 * DocumentApproval 那套多關卡簽核鏈刻意分開，這裡只是單一送審人→單一
 * 審核結果的輕量流程：審核權限比照既有工程財務模組的慣例，用
 * PROJECT/WRITE 權限（assertCanWrite），不另外定義新的審核者角色。
 */
@Injectable()
export class MaterialSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  async list(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return this.prisma.materialSubmission.findMany({
      where: { projectId },
      include: {
        vendor: { select: { name: true } },
        submittedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { submittedDate: 'desc' },
    });
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateMaterialSubmissionDto,
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);

    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: dto.vendorId },
      });
      if (!vendor || vendor.spaceId !== project.spaceId) {
        throw new BadRequestException('廠商不存在');
      }
    }

    return this.prisma.materialSubmission.create({
      data: {
        projectId,
        materialName: dto.materialName,
        spec: dto.spec,
        vendorId: dto.vendorId,
        submittedDate: new Date(dto.submittedDate),
        submittedByUserId: userId,
      },
      include: {
        vendor: { select: { name: true } },
        submittedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    });
  }

  /** 核准/駁回——只能對 PENDING 的送審動作，審核結果 LINE 通知原送審人。 */
  async review(
    userId: string,
    projectId: string,
    submissionId: string,
    dto: ReviewMaterialSubmissionDto,
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    const submission = await this.getSubmissionOrThrow(projectId, submissionId);
    if (submission.status !== MaterialSubmissionStatus.PENDING) {
      throw new BadRequestException('這筆材料送審已經審核過了');
    }

    const updated = await this.prisma.materialSubmission.update({
      where: { id: submission.id },
      data: {
        status: dto.status,
        reviewComment: dto.reviewComment,
        reviewedByUserId: userId,
        reviewedDate: new Date(),
      },
      include: {
        vendor: { select: { name: true } },
        submittedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    });

    const resultLabel =
      dto.status === MaterialSubmissionStatus.APPROVED ? '核准' : '駁回';
    await this.lineNotifier.notifyByUser(
      submission.submittedByUserId,
      `📦 材料送審結果\n「${submission.materialName}」已${resultLabel}。${dto.reviewComment ? `\n備註：${dto.reviewComment}` : ''}`,
    );

    return updated;
  }

  /** 只能刪 PENDING 狀態的——已審核過的送審紀錄要保留審核歷史，不能刪掉。 */
  async remove(userId: string, projectId: string, submissionId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertCanWrite(userId, project);
    const submission = await this.getSubmissionOrThrow(projectId, submissionId);
    if (submission.status !== MaterialSubmissionStatus.PENDING) {
      throw new BadRequestException('已審核過的材料送審不能刪除');
    }
    await this.prisma.materialSubmission.delete({
      where: { id: submission.id },
    });
  }

  private async getSubmissionOrThrow(
    projectId: string,
    submissionId: string,
  ): Promise<MaterialSubmission> {
    const submission = await this.prisma.materialSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission || submission.projectId !== projectId) {
      throw new NotFoundException('Material submission not found');
    }
    return submission;
  }
}
