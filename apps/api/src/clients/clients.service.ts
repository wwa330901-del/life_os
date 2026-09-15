import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PermissionAction,
  PermissionResourceType,
} from '../../generated/prisma/client.js';
import type { Client } from '../../generated/prisma/client.js';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

/**
 * 客戶資料庫 — 顧問文件「CRM：客戶與協力廠商雙軌管理」的客戶端那一半
 * （Vendor 是協力商那一半）。掛在公司空間底下，該空間所有成員共用同一份
 * 清單，跟 Vendor 同一個信任邊界慣例。2026-09 設計確認：這輪只做基本資
 * 料＋關聯專案，顧問文件原本還提到的「聯繫紀錄」「業務成案比例分析」使
 * 用者明確要求跳過。
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    return this.prisma.client.findMany({
      where: { spaceId },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateClientDto) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.CLIENT,
      PermissionAction.WRITE,
    );
    return this.prisma.client.create({
      data: {
        spaceId,
        name: dto.name,
        contactPerson: dto.contactPerson,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        address: dto.address,
        note: dto.note,
      },
    });
  }

  async update(
    userId: string,
    spaceId: string,
    clientId: string,
    dto: UpdateClientDto,
  ) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.CLIENT,
      PermissionAction.WRITE,
    );
    await this.getClientOrThrow(spaceId, clientId);
    return this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.contactPerson !== undefined && {
          contactPerson: dto.contactPerson,
        }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone,
        }),
        ...(dto.contactEmail !== undefined && {
          contactEmail: dto.contactEmail,
        }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
  }

  async remove(userId: string, spaceId: string, clientId: string) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.CLIENT,
      PermissionAction.WRITE,
    );
    await this.getClientOrThrow(spaceId, clientId);
    // 有專案引用這個客戶會擋在外鍵上，直接讓 Prisma 的 P2003 錯誤傳出去即
    // 可，不用先手動查詢——低頻管理操作，不值得為了更友善的錯誤訊息多查
    // 一次，跟 VendorsService.remove 同一個理由。
    await this.prisma.client.delete({ where: { id: clientId } });
  }

  /** Public — `ProjectsService.create` calls this to validate a client
   * belongs to the space before linking it to a new project. */
  async getClientOrThrow(spaceId: string, clientId: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client || client.spaceId !== spaceId) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }
}
