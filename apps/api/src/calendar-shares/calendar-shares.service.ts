import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CalendarShareDetailLevel } from '../../generated/prisma/client.js';

const userSummary = { select: { id: true, name: true, email: true } } as const;

/** 共用行事曆 (2026-08-05) — 詳細規格見 CalendarShare 的 schema 註解。這個
 * service 是唯一寫 `calendarShare` 表的地方，也是「合併檢視」（自己的行事曆
 * + 每個已接受的分享）的組裝點。*/
@Injectable()
export class CalendarSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async invite(ownerUserId: string, email: string) {
    const target = await this.usersService.findByEmail(email);
    if (!target) throw new NotFoundException('找不到這個 email 對應的帳號');
    if (target.id === ownerUserId) throw new BadRequestException('不能邀請自己');

    const existing = await this.prisma.calendarShare.findUnique({
      where: { ownerUserId_viewerUserId: { ownerUserId, viewerUserId: target.id } },
    });
    if (existing) throw new BadRequestException('已經邀請過這個人了');

    return this.prisma.calendarShare.create({
      data: { ownerUserId, viewerUserId: target.id },
      include: { viewer: userSummary },
    });
  }

  /** 我分享出去的（給自己看：誰在看我的行事曆、要不要調整詳細程度）。 */
  async listGiven(ownerUserId: string) {
    return this.prisma.calendarShare.findMany({
      where: { ownerUserId },
      include: { viewer: userSummary },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 別人分享給我的（含還沒接受的邀請，App 的「待處理邀請」畫面用這個）。 */
  async listReceived(viewerUserId: string) {
    return this.prisma.calendarShare.findMany({
      where: { viewerUserId },
      include: { owner: userSummary },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(viewerUserId: string, id: string) {
    const share = await this.getOrThrow(id);
    if (share.viewerUserId !== viewerUserId) {
      throw new ForbiddenException('這不是你收到的邀請');
    }
    return this.prisma.calendarShare.update({
      where: { id },
      data: { accepted: true },
      include: { owner: userSummary },
    });
  }

  /** 擁有者撤銷、或檢視者拒絕/移除——都是同一個動作：直接刪除這筆紀錄，
   * 不留「已拒絕」的墓碑，之後要重新邀請就是全新的一筆。 */
  async remove(userId: string, id: string) {
    const share = await this.getOrThrow(id);
    if (share.ownerUserId !== userId && share.viewerUserId !== userId) {
      throw new ForbiddenException('這不是你的共用行事曆邀請');
    }
    await this.prisma.calendarShare.delete({ where: { id } });
  }

  /** 詳細程度是擁有者的權限（曝光的是他自己的資訊），檢視者不能改。 */
  async updateDetailLevel(ownerUserId: string, id: string, detailLevel: CalendarShareDetailLevel) {
    const share = await this.getOrThrow(id);
    if (share.ownerUserId !== ownerUserId) {
      throw new ForbiddenException('只有擁有者可以調整詳細程度');
    }
    return this.prisma.calendarShare.update({ where: { id }, data: { detailLevel } });
  }

  /** 顏色是檢視者自己畫面上的顯示偏好，擁有者不能改、也不會被通知。 */
  async updateColor(viewerUserId: string, id: string, viewerColor: string) {
    const share = await this.getOrThrow(id);
    if (share.viewerUserId !== viewerUserId) {
      throw new ForbiddenException('只有檢視者可以調整顏色');
    }
    return this.prisma.calendarShare.update({ where: { id }, data: { viewerColor } });
  }

  /** 合併檢視：自己的行事曆事件 + 每個已接受分享的擁有者事件（依
   * detailLevel 決定要不要透出標題/地點/備註），每筆都標上是誰的、檢視者
   * 選的顏色，讓 App 疊圖時能分辨。 */
  async combinedEvents(viewerUserId: string, from: string, to: string) {
    const range = { gte: new Date(from), lt: new Date(to) };

    const ownSpace = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: viewerUserId } });
    const ownEvents = ownSpace
      ? await this.prisma.calendarEvent.findMany({
          where: { spaceId: ownSpace.id, startAt: range },
          orderBy: { startAt: 'asc' },
        })
      : [];

    const shares = await this.prisma.calendarShare.findMany({
      where: { viewerUserId, accepted: true },
      include: { owner: { select: { id: true, name: true } } },
    });

    const sharedGroups = await Promise.all(
      shares.map(async (share) => {
        const ownerSpace = await this.prisma.space.findUnique({
          where: { calendarOwnerUserId: share.ownerUserId },
        });
        if (!ownerSpace) return [];
        const events = await this.prisma.calendarEvent.findMany({
          where: { spaceId: ownerSpace.id, startAt: range },
          orderBy: { startAt: 'asc' },
        });
        const full = share.detailLevel === CalendarShareDetailLevel.FULL;
        return events.map((e) => ({
          id: e.id,
          startAt: e.startAt,
          endAt: e.endAt,
          allDay: e.allDay,
          title: full ? e.title : '忙碌',
          location: full ? e.location : null,
          notes: full ? e.notes : null,
          ownerUserId: share.ownerUserId,
          ownerName: share.owner.name,
          color: share.viewerColor,
        }));
      }),
    );

    return { own: ownEvents, shared: sharedGroups.flat() };
  }

  private async getOrThrow(id: string) {
    const share = await this.prisma.calendarShare.findUnique({ where: { id } });
    if (!share) throw new NotFoundException('找不到這筆共用邀請');
    return share;
  }
}
