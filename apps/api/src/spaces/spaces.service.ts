import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipRole, SpaceType } from '../../generated/prisma/client.js';

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  createPersonalSpace(userId: string, ownerName: string) {
    return this.prisma.space.create({
      data: {
        type: SpaceType.PERSONAL,
        name: `${ownerName} 的個人空間`,
        ownerUserId: userId,
      },
    });
  }

  /** Created on demand (not at signup, unlike the personal space) the first
   * time a user wants a calendar. `calendarOwnerUserId` being `@unique`
   * means a second call for the same user just returns their existing one
   * rather than erroring — the "space list" screen's create button is
   * idempotent from the user's point of view. */
  async getOrCreateCalendarSpace(userId: string) {
    const existing = await this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } });
    if (existing) return existing;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.prisma.space.create({
      data: {
        type: SpaceType.CALENDAR,
        name: `${user.name} 的行事曆`,
        calendarOwnerUserId: userId,
      },
    });
  }

  /** All spaces a user is allowed to see: their personal space, their
   * calendar space (if created), + any company they're a member of. */
  async listForUser(userId: string) {
    const [personalSpace, calendarSpace, memberships] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } }),
      this.prisma.companyMembership.findMany({
        where: { userId },
        include: { space: true },
      }),
    ]);

    const companySpaces = memberships.map((m) => ({
      id: m.space.id,
      type: m.space.type,
      name: m.space.name,
      role: m.role,
    }));

    const spaces = [
      ...(personalSpace ? [{ id: personalSpace.id, type: personalSpace.type, name: personalSpace.name, role: null }] : []),
      ...(calendarSpace ? [{ id: calendarSpace.id, type: calendarSpace.type, name: calendarSpace.name, role: null }] : []),
      ...companySpaces,
    ];

    return spaces;
  }

  /** Confirms the user may access this space, and returns it. Throws otherwise. */
  async getForUserOrThrow(userId: string, spaceId: string) {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.type === SpaceType.PERSONAL) {
      if (space.ownerUserId !== userId) {
        throw new ForbiddenException('You do not have access to this space');
      }
      return { ...space, role: null };
    }

    if (space.type === SpaceType.CALENDAR) {
      if (space.calendarOwnerUserId !== userId) {
        throw new ForbiddenException('You do not have access to this space');
      }
      return { ...space, role: null };
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this space');
    }

    return { ...space, role: membership.role };
  }

  /** Every member of a company space — used to populate "who can I add to
   * this project" pickers. Any member of the space may call this (not just
   * platform admins, unlike the equivalent admin endpoint). */
  async listMembers(userId: string, spaceId: string) {
    await this.getForUserOrThrow(userId, spaceId);
    const memberships = await this.prisma.companyMembership.findMany({
      where: { spaceId },
      include: { user: { select: { id: true, username: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    }));
  }

  /** Company spaces only — personal/calendar spaces are 1:1-per-user and
   * not something this endpoint is meant to touch. OWNER-only (2026-08-03
   * user decision, confirming by typing the space's name is enforced
   * client-side only — the real authorization is this role check).
   * `Project.spaceId`/`CompanyMembership.spaceId` are the only two
   * `ON DELETE RESTRICT` foreign keys pointing at Space (everything else —
   * DocumentTemplate, GeneratedDocument, ProjectPropertyDefinition, etc. —
   * cascades), so both have to be cleared explicitly before the Space
   * itself can go; deleting the Projects first cascades away everything
   * under them (WorkItem/ProjectMember/ProjectTodo/GeneratedDocument/
   * ProjectPropertyValue/...) via their own existing Cascade rules. */
  async remove(userId: string, spaceId: string): Promise<void> {
    const space = await this.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.COMPANY) {
      throw new BadRequestException('只能刪除公司空間');
    }
    if (space.role !== MembershipRole.OWNER) {
      throw new ForbiddenException('只有空間擁有者可以刪除這個空間');
    }
    await this.prisma.$transaction([
      this.prisma.project.deleteMany({ where: { spaceId } }),
      this.prisma.companyMembership.deleteMany({ where: { spaceId } }),
      this.prisma.space.delete({ where: { id: spaceId } }),
    ]);
  }
}
