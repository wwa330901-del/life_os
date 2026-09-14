import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import {
  MembershipRole,
  PermissionAction,
  PermissionResourceType,
  SpaceType,
} from '../../generated/prisma/client.js';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateDepartmentRankDto } from './dto/create-department-rank.dto';
import { UpdateDepartmentRankDto } from './dto/update-department-rank.dto';
import { AssignMemberDepartmentDto } from './dto/assign-member-department.dto';
import { CreatePermissionRuleDto } from './dto/create-permission-rule.dto';

/**
 * 公司空間權限引擎（2026-08-31 設計，見
 * project_life_os_company_space_target_scope 記憶）。「讀」永遠放行，只有
 * WRITE/APPROVE/EXPORT 三種動作會被 assertCan 擋。空間 OWNER 永遠放行、不
 * 受規則限制（否則自己設規則前就先把自己鎖在外面）；OWNER 以外，沒有找到
 * 一條「部門＋職級都精準符合當事人」的規則就一律拒絕——包含還沒被指派部
 * 門/職級的成員，他們只吃 department=null 且 rank=null 的規則。
 *
 * 這輪只覆蓋 PermissionResourceType 列出的 8 個既有模組（PROJECT/TODOS/
 * DOCUMENTS/VENDOR/QUOTATION/COST_CONTROL/PROCUREMENT/PAYMENT_REQUEST）——
 * 呼叫端要自己決定該用哪個 resourceType，這裡不做模組對應表。
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
  ) {}

  /** Throwing form — use at every actual mutation call site. */
  async assertCan(
    userId: string,
    spaceId: string,
    resourceType: PermissionResourceType,
    action: PermissionAction,
  ): Promise<void> {
    const allowed = await this.can(userId, spaceId, resourceType, action);
    if (!allowed) {
      throw new ForbiddenException(
        `您沒有權限執行此操作（${resourceType} / ${action}）`,
      );
    }
  }

  /** Non-throwing form — for a "should I even show this button" probe from
   * the client (e.g. 工程報價單 PDF 匯出是純前端渲染，沒有天然的後端寫入
   * 關口可以擋，App 改成先問這個端點決定要不要顯示匯出按鈕，見
   * `EngineeringQuotationController`'s `checkExportPermission`). */
  async can(
    userId: string,
    spaceId: string,
    resourceType: PermissionResourceType,
    action: PermissionAction,
  ): Promise<boolean> {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    // Department/PermissionRule 只可能存在於 COMPANY 空間——個人/行事曆空間
    // 完全沒有部門概念，也永遠不會有任何 PermissionRule 掛在它們的 spaceId
    // 底下。不在這裡先擋住的話，PROJECT/TODOS 這類同時橫跨個人與公司專案
    // 的 resourceType，一碰到個人空間的專案就會因為「找不到規則」被誤判拒
    // 絕，把自己空間的擁有者鎖在自己的資料外面。
    if (space.type !== SpaceType.COMPANY) return true;
    // ADMIN 在既有程式碼裡到處都跟 OWNER 同權（見 ProjectsService.assertAccess
    // 等），2026-09 使用者確認新引擎維持這個慣例，不因為接上新權限檢查就讓
    // ADMIN 反而變得比現在更受限。只有真正的一般 MEMBER 才吃 PermissionRule。
    if (space.role === MembershipRole.OWNER || space.role === MembershipRole.ADMIN) {
      return true;
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
    });
    // getForUserOrThrow 已經確認過這是一個該使用者有 membership 的公司空間，
    // 這裡理論上一定找得到，findUnique 只是拿 departmentId/rankId。
    const departmentId = membership?.departmentId ?? null;
    const rankId = membership?.rankId ?? null;

    const rule = await this.prisma.permissionRule.findFirst({
      where: { spaceId, resourceType, action, departmentId, rankId },
      select: { id: true },
    });
    return rule !== null;
  }

  // ---- 部門 ----

  async listDepartments(userId: string, spaceId: string) {
    await this.spacesService.getForUserOrThrow(userId, spaceId);
    return this.prisma.department.findMany({
      where: { spaceId },
      orderBy: { sortOrder: 'asc' },
      include: { ranks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async createDepartment(
    userId: string,
    spaceId: string,
    dto: CreateDepartmentDto,
  ) {
    await this.assertOwner(userId, spaceId);
    const count = await this.prisma.department.count({ where: { spaceId } });
    return this.prisma.department.create({
      data: { spaceId, name: dto.name, sortOrder: count },
    });
  }

  async updateDepartment(
    userId: string,
    spaceId: string,
    departmentId: string,
    dto: UpdateDepartmentDto,
  ) {
    await this.assertOwner(userId, spaceId);
    await this.getDepartmentOrThrow(spaceId, departmentId);
    return this.prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async removeDepartment(
    userId: string,
    spaceId: string,
    departmentId: string,
  ) {
    await this.assertOwner(userId, spaceId);
    await this.getDepartmentOrThrow(spaceId, departmentId);
    // DepartmentRank/PermissionRule 都是 onDelete: Cascade 掛在 Department
    // 底下，CompanyMembership.departmentId/rankId 則是 SetNull——成員不會
    // 因為部門被刪就跟著被砍，只是打回「無部門/無職級」狀態。
    await this.prisma.department.delete({ where: { id: departmentId } });
  }

  // ---- 職級 ----

  async createRank(
    userId: string,
    spaceId: string,
    departmentId: string,
    dto: CreateDepartmentRankDto,
  ) {
    await this.assertOwner(userId, spaceId);
    await this.getDepartmentOrThrow(spaceId, departmentId);
    const count = await this.prisma.departmentRank.count({
      where: { departmentId },
    });
    return this.prisma.departmentRank.create({
      data: { departmentId, name: dto.name, sortOrder: count },
    });
  }

  async updateRank(
    userId: string,
    spaceId: string,
    departmentId: string,
    rankId: string,
    dto: UpdateDepartmentRankDto,
  ) {
    await this.assertOwner(userId, spaceId);
    await this.getRankOrThrow(spaceId, departmentId, rankId);
    return this.prisma.departmentRank.update({
      where: { id: rankId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async removeRank(
    userId: string,
    spaceId: string,
    departmentId: string,
    rankId: string,
  ) {
    await this.assertOwner(userId, spaceId);
    await this.getRankOrThrow(spaceId, departmentId, rankId);
    await this.prisma.departmentRank.delete({ where: { id: rankId } });
  }

  // ---- 成員的部門/職級指派 ----

  async assignMemberDepartment(
    userId: string,
    spaceId: string,
    targetUserId: string,
    dto: AssignMemberDepartmentDto,
  ) {
    await this.assertOwner(userId, spaceId);
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_spaceId: { userId: targetUserId, spaceId } },
    });
    if (!membership) {
      throw new NotFoundException('這個人不是這個空間的成員');
    }

    let departmentId = membership.departmentId;
    if (dto.departmentId !== undefined) {
      if (dto.departmentId === null) {
        departmentId = null;
      } else {
        await this.getDepartmentOrThrow(spaceId, dto.departmentId);
        departmentId = dto.departmentId;
      }
    }

    let rankId = membership.rankId;
    if (dto.rankId !== undefined) {
      if (dto.rankId === null) {
        rankId = null;
      } else {
        if (!departmentId) {
          throw new BadRequestException('要先有部門才能指派職級');
        }
        await this.getRankOrThrow(spaceId, departmentId, dto.rankId);
        rankId = dto.rankId;
      }
    }
    // 換部門但沒同時給新職級時，舊職級多半已經不屬於新部門——直接清空，
    // 逼使用者重新選,比留著一個看似有效但其實對不上部門的職級安全。
    if (
      dto.departmentId !== undefined &&
      dto.rankId === undefined &&
      rankId &&
      rankId === membership.rankId
    ) {
      const oldRank = await this.prisma.departmentRank.findUnique({
        where: { id: rankId },
      });
      if (!oldRank || oldRank.departmentId !== departmentId) {
        rankId = null;
      }
    }

    return this.prisma.companyMembership.update({
      where: { id: membership.id },
      data: { departmentId, rankId },
    });
  }

  // ---- 權限規則 ----

  async listRules(userId: string, spaceId: string) {
    await this.assertOwner(userId, spaceId);
    return this.prisma.permissionRule.findMany({
      where: { spaceId },
      include: { department: true, rank: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createRule(
    userId: string,
    spaceId: string,
    dto: CreatePermissionRuleDto,
  ) {
    await this.assertOwner(userId, spaceId);

    let departmentId = dto.departmentId ?? null;
    const rankId = dto.rankId ?? null;

    if (rankId) {
      const rank = await this.prisma.departmentRank.findUnique({
        where: { id: rankId },
      });
      if (!rank) throw new NotFoundException('Rank not found');
      const department = await this.getDepartmentOrThrow(
        spaceId,
        rank.departmentId,
      );
      if (departmentId && departmentId !== department.id) {
        throw new BadRequestException('指定的部門跟指定的職級對不上');
      }
      // 有給 rankId 時，departmentId 自動帶那個職級所屬的部門——避免
      // 「department=A 但 rank 其實屬於 B」這種矛盾規則存進資料庫。
      departmentId = department.id;
    } else if (departmentId) {
      await this.getDepartmentOrThrow(spaceId, departmentId);
    }

    const duplicate = await this.prisma.permissionRule.findFirst({
      where: {
        spaceId,
        resourceType: dto.resourceType,
        action: dto.action,
        departmentId,
        rankId,
      },
    });
    if (duplicate) {
      throw new BadRequestException('這條規則已經存在了');
    }

    return this.prisma.permissionRule.create({
      data: {
        spaceId,
        resourceType: dto.resourceType,
        action: dto.action,
        departmentId,
        rankId,
      },
    });
  }

  async removeRule(userId: string, spaceId: string, ruleId: string) {
    await this.assertOwner(userId, spaceId);
    const rule = await this.prisma.permissionRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule || rule.spaceId !== spaceId) {
      throw new NotFoundException('Rule not found');
    }
    await this.prisma.permissionRule.delete({ where: { id: ruleId } });
  }

  // ---- 內部小工具 ----

  private async assertOwner(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.role !== MembershipRole.OWNER) {
      throw new ForbiddenException('只有空間擁有者可以做這個操作');
    }
  }

  private async getDepartmentOrThrow(spaceId: string, departmentId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department || department.spaceId !== spaceId) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  private async getRankOrThrow(
    spaceId: string,
    departmentId: string,
    rankId: string,
  ) {
    await this.getDepartmentOrThrow(spaceId, departmentId);
    const rank = await this.prisma.departmentRank.findUnique({
      where: { id: rankId },
    });
    if (!rank || rank.departmentId !== departmentId) {
      throw new NotFoundException('Rank not found');
    }
    return rank;
  }
}
