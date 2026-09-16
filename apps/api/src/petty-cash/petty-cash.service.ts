import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PermissionAction,
  PermissionResourceType,
  PettyCashType,
} from '../../generated/prisma/client.js';
import { CreatePettyCashTransactionDto } from './dto/create-petty-cash-transaction.dto';

/**
 * 零用金規則（2026-09，顧問文件財務系統子項）——掛在公司空間底下，全空間
 * 共用同一本帳。projectId 只是「這筆支出花在哪個專案」的標記，不影響餘
 * 額計算範圍——餘額永遠是整個空間的存入減支出。權限沿用既有
 * PAYMENT_REQUEST resourceType，零用金屬於財務性質的操作，沒必要另開一
 * 個 resourceType。
 */
@Injectable()
export class PettyCashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    const transactions = await this.prisma.pettyCashTransaction.findMany({
      where: { spaceId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { transactionDate: 'desc' },
    });
    const balance = transactions.reduce(
      (sum, t) =>
        t.type === PettyCashType.DEPOSIT ? sum + t.amount : sum - t.amount,
      0,
    );
    return { transactions, balance };
  }

  async create(
    userId: string,
    spaceId: string,
    dto: CreatePettyCashTransactionDto,
  ) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.PAYMENT_REQUEST,
      PermissionAction.WRITE,
    );
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project || project.spaceId !== spaceId) {
        throw new NotFoundException('Project not found');
      }
    }
    await this.prisma.pettyCashTransaction.create({
      data: {
        spaceId,
        transactionDate: new Date(dto.transactionDate),
        type: dto.type,
        amount: dto.amount,
        purpose: dto.purpose,
        projectId: dto.projectId,
        createdByUserId: userId,
      },
    });
    return this.list(userId, spaceId);
  }

  async remove(userId: string, spaceId: string, transactionId: string) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.PAYMENT_REQUEST,
      PermissionAction.WRITE,
    );
    const transaction = await this.prisma.pettyCashTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction || transaction.spaceId !== spaceId) {
      throw new NotFoundException('Petty cash transaction not found');
    }
    await this.prisma.pettyCashTransaction.delete({
      where: { id: transactionId },
    });
    return this.list(userId, spaceId);
  }
}
