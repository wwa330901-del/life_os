import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const userSummary = { select: { id: true, name: true, email: true } } as const;

/** 好友 (2026-08-06) — 詳細規格見 Friendship 的 schema 註解。這個 service
 * 是唯一寫 `friendship` 表的地方，也是 `assertFriends` 的唯一實作——
 * 共用行事曆/借出借入互通的邀請流程都得先過這關才能繼續。 */
@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async invite(userId: string, email: string) {
    const target = await this.usersService.findByEmail(email);
    if (!target) throw new NotFoundException('找不到這個 email 對應的帳號');
    if (target.id === userId) throw new BadRequestException('不能加自己好友');

    const existing = await this.findEitherDirection(userId, target.id);
    if (existing) {
      throw new BadRequestException(existing.accepted ? '已經是好友了' : '已經邀請過這個人了');
    }

    return this.prisma.friendship.create({
      data: { requesterUserId: userId, addresseeUserId: target.id },
      include: { addressee: userSummary },
    });
  }

  /** 已接受的好友（不分是誰先邀請誰），統一回傳「對方」的資料，外加這筆
   * Friendship 自己的 id（`friendshipId`）——App 端移除好友要用這個 id
   * 呼叫 `remove`，不是對方的 userId。 */
  async listFriends(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { accepted: true, OR: [{ requesterUserId: userId }, { addresseeUserId: userId }] },
      include: { requester: userSummary, addressee: userSummary },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      friendshipId: r.id,
      ...(r.requesterUserId === userId ? r.addressee : r.requester),
    }));
  }

  /** 別人邀請我、我還沒回應的。 */
  async listReceivedInvites(userId: string) {
    return this.prisma.friendship.findMany({
      where: { addresseeUserId: userId, accepted: false },
      include: { requester: userSummary },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 我邀請別人、對方還沒回應的。 */
  async listSentInvites(userId: string) {
    return this.prisma.friendship.findMany({
      where: { requesterUserId: userId, accepted: false },
      include: { addressee: userSummary },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(userId: string, id: string) {
    const row = await this.getOrThrow(id);
    if (row.addresseeUserId !== userId) {
      throw new ForbiddenException('這不是你收到的好友邀請');
    }
    return this.prisma.friendship.update({
      where: { id },
      data: { accepted: true },
      include: { requester: userSummary },
    });
  }

  /** 拒絕邀請、撤銷還沒被接受的邀請、或直接刪除好友——都是同一個動作：
   * 刪掉這筆關係，不留「已拒絕」的墓碑，之後要重新加就是全新的一筆，
   * 跟這個 schema 裡其他邀請系統同一套設計。 */
  async remove(userId: string, id: string) {
    const row = await this.getOrThrow(id);
    if (row.requesterUserId !== userId && row.addresseeUserId !== userId) {
      throw new ForbiddenException('這不是你的好友關係');
    }
    await this.prisma.friendship.delete({ where: { id } });
  }

  /** 共用行事曆/借出借入互通的邀請流程都靠這個把關——必須先是已接受的
   * 好友才能繼續，不再直接打 email。 */
  async assertFriends(userId: string, otherUserId: string): Promise<void> {
    const row = await this.findEitherDirection(userId, otherUserId);
    if (!row?.accepted) {
      throw new BadRequestException('必須先加對方為好友才能這麼做');
    }
  }

  private async findEitherDirection(a: string, b: string) {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterUserId: a, addresseeUserId: b },
          { requesterUserId: b, addresseeUserId: a },
        ],
      },
    });
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('找不到這筆好友關係');
    return row;
  }
}
