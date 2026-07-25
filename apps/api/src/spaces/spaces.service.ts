import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpaceType } from '../../generated/prisma/client.js';

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

  /** All spaces a user is allowed to see: their personal space + any company they're a member of. */
  async listForUser(userId: string) {
    const [personalSpace, memberships] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId } }),
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

    const spaces = personalSpace
      ? [
          {
            id: personalSpace.id,
            type: personalSpace.type,
            name: personalSpace.name,
            role: null,
          },
          ...companySpaces,
        ]
      : companySpaces;

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
}
