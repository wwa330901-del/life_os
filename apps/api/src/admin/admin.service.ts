import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipRole, SpaceType } from '../../generated/prisma/client.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        createdAt: true,
        emailVerifiedAt: true,
        isPlatformAdmin: true,
        googleId: true,
      },
    });
    return users.map(({ googleId, ...u }) => ({
      ...u,
      hasGoogleLogin: googleId !== null,
    }));
  }

  async listSpaces() {
    const spaces = await this.prisma.space.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { memberships: true } },
        owner: { select: { name: true } },
      },
    });
    return spaces.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      createdAt: s.createdAt,
      memberCount: s.type === SpaceType.COMPANY ? s._count.memberships : null,
      personalOwnerName: s.type === SpaceType.PERSONAL ? s.owner?.name : null,
    }));
  }

  async getSpaceDetail(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, username: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return {
      id: space.id,
      type: space.type,
      name: space.name,
      members: space.memberships.map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    };
  }

  createCompanySpace(name: string) {
    return this.prisma.space.create({
      data: { type: SpaceType.COMPANY, name },
    });
  }

  async addMember(spaceId: string, username: string, role: MembershipRole) {
    const space = await this.getCompanySpaceOrThrow(spaceId);
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new NotFoundException('找不到這個帳號');
    }
    const existing = await this.prisma.companyMembership.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId: space.id } },
    });
    if (existing) {
      throw new ConflictException('這個帳號已經是這個空間的成員');
    }
    return this.prisma.companyMembership.create({
      data: { userId: user.id, spaceId: space.id, role },
    });
  }

  async updateMemberRole(
    spaceId: string,
    userId: string,
    role: MembershipRole,
  ) {
    await this.getMembershipOrThrow(spaceId, userId);
    return this.prisma.companyMembership.update({
      where: { userId_spaceId: { userId, spaceId } },
      data: { role },
    });
  }

  async removeMember(spaceId: string, userId: string) {
    await this.getMembershipOrThrow(spaceId, userId);
    await this.prisma.companyMembership.delete({
      where: { userId_spaceId: { userId, spaceId } },
    });
  }

  private async getCompanySpaceOrThrow(spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space || space.type !== SpaceType.COMPANY) {
      throw new NotFoundException('Company space not found');
    }
    return space;
  }

  private async getMembershipOrThrow(spaceId: string, userId: string) {
    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    return membership;
  }
}
