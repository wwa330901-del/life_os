import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  PermissionAction,
  PermissionResourceType,
} from '../../generated/prisma/client.js';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

/**
 * 廠商主檔 — 掛在公司空間（Space）底下，該空間所有成員共用同一份清單（不是
 * 只有建立者自己看得到），不同公司空間各自獨立，2026-08-14 確認過的範圍。
 * 採發比價表的廠商報價從這裡選（不再自由輸入文字），決標後工程請款單自動
 * 撈這裡的收款帳戶資料快照進去，同一家廠商在不同案子都能重複帶用。
 * 「配合過案件資料」刻意不落地存欄位——透過 getHistory 從
 * ProcurementVendorQuote 現查這家廠商實際比過價/得標過哪些案子，避免又要
 * 另外維護一份跟報價紀錄可能對不起來的清單。
 */
@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(userId: string, spaceId: string) {
    // 讀取一律放行，不經過權限引擎——見 PermissionsService 的說明。
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    return this.prisma.vendor.findMany({
      where: { spaceId },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: string, spaceId: string, dto: CreateVendorDto) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.VENDOR,
      PermissionAction.WRITE,
    );
    return this.prisma.vendor.create({
      data: {
        spaceId,
        name: dto.name,
        taxId: dto.taxId,
        contactPerson: dto.contactPerson,
        contactPhone: dto.contactPhone,
        address: dto.address,
        tradeCategory: dto.tradeCategory,
        rating: dto.rating,
        characteristics: dto.characteristics,
        bankAccount: dto.bankAccount,
        accountHolder: dto.accountHolder,
        bankBranch: dto.bankBranch,
        note: dto.note,
        courtSeizureFlag: dto.courtSeizureFlag,
      },
    });
  }

  async update(
    userId: string,
    spaceId: string,
    vendorId: string,
    dto: UpdateVendorDto,
  ) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.VENDOR,
      PermissionAction.WRITE,
    );
    await this.getVendorOrThrow(spaceId, vendorId);
    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.contactPerson !== undefined && {
          contactPerson: dto.contactPerson,
        }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone,
        }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.tradeCategory !== undefined && {
          tradeCategory: dto.tradeCategory,
        }),
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.characteristics !== undefined && {
          characteristics: dto.characteristics,
        }),
        ...(dto.bankAccount !== undefined && { bankAccount: dto.bankAccount }),
        ...(dto.accountHolder !== undefined && {
          accountHolder: dto.accountHolder,
        }),
        ...(dto.bankBranch !== undefined && { bankBranch: dto.bankBranch }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.courtSeizureFlag !== undefined && {
          courtSeizureFlag: dto.courtSeizureFlag,
        }),
      },
    });
  }

  async remove(userId: string, spaceId: string, vendorId: string) {
    await this.permissionsService.assertCan(
      userId,
      spaceId,
      PermissionResourceType.VENDOR,
      PermissionAction.WRITE,
    );
    await this.getVendorOrThrow(spaceId, vendorId);
    // 有引用這家廠商的 ProcurementVendorQuote 會擋在 RESTRICT 外鍵上，直接讓
    // Prisma 的 P2003 錯誤傳出去即可，不用先手動查詢——這是低頻管理操作，不
    // 值得為了更友善的錯誤訊息多查一次。
    await this.prisma.vendor.delete({ where: { id: vendorId } });
  }

  /** 配合過案件——這家廠商在哪些比價表出現過、是否得標，跨這個空間的所有
   * 專案。現查、不落地存。 */
  async getHistory(userId: string, spaceId: string, vendorId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    await this.getVendorOrThrow(spaceId, vendorId);
    const quotes = await this.prisma.procurementVendorQuote.findMany({
      where: { vendorId, comparison: { project: { spaceId } } },
      include: {
        comparison: {
          include: {
            project: { select: { id: true, name: true } },
            quotationLineItem: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return quotes.map((q) => ({
      comparisonId: q.comparisonId,
      projectId: q.comparison.project.id,
      projectName: q.comparison.project.name,
      scopeName: q.comparison.quotationLineItem.name,
      quotedAmount: q.quotedAmount,
      negotiatedAmount: q.negotiatedAmount,
      awardedAmount: q.awardedAmount,
      wasSelected: q.comparison.selectedVendorQuoteId === q.id,
      createdAt: q.createdAt,
    }));
  }

  /** 業務成案比例分析（2026-09，顧問文件協力商資料庫子項）——分母是這家
   * 廠商在這個空間裡所有比價表中「被邀請報價」的次數（ProcurementVendorQuote
   * 筆數），分子是其中「被決標」的次數（comparison.selectedVendorQuoteId
   * 指向這筆報價，即 selectedFor 反關聯不為 null）。跟 getHistory 共用同
   * 一組資料來源，這裡只回傳計數不回傳明細。 */
  async getWinRate(userId: string, spaceId: string, vendorId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    await this.getVendorOrThrow(spaceId, vendorId);
    const quotes = await this.prisma.procurementVendorQuote.findMany({
      where: { vendorId, comparison: { project: { spaceId } } },
      include: { comparison: { select: { selectedVendorQuoteId: true } } },
    });
    const invitedCount = quotes.length;
    const awardedCount = quotes.filter(
      (q) => q.comparison.selectedVendorQuoteId === q.id,
    ).length;
    return {
      invitedCount,
      awardedCount,
      winRate: invitedCount > 0 ? awardedCount / invitedCount : 0,
    };
  }

  private async getVendorOrThrow(spaceId: string, vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor || vendor.spaceId !== spaceId) {
      throw new NotFoundException('Vendor not found');
    }
    return vendor;
  }
}
