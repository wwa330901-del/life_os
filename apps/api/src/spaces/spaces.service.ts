import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  /** All spaces a user is allowed to see: their personal space and their
   * calendar space (if created). */
  async listForUser(userId: string) {
    const [personalSpace, calendarSpace] = await Promise.all([
      this.prisma.space.findUnique({ where: { ownerUserId: userId } }),
      this.prisma.space.findUnique({ where: { calendarOwnerUserId: userId } }),
    ]);

    return [
      ...(personalSpace ? [{ id: personalSpace.id, type: personalSpace.type, name: personalSpace.name }] : []),
      ...(calendarSpace ? [{ id: calendarSpace.id, type: calendarSpace.type, name: calendarSpace.name }] : []),
    ];
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
      return space;
    }

    if (space.calendarOwnerUserId !== userId) {
      throw new ForbiddenException('You do not have access to this space');
    }
    return space;
  }
}
