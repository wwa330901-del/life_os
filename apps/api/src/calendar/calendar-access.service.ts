import { BadRequestException, Injectable } from '@nestjs/common';
import { SpacesService } from '../spaces/spaces.service';
import { SpaceType } from '../../generated/prisma/client.js';

/** Every calendar-module endpoint is scoped to the caller's own calendar
 * space — 行事曆 is a solo feature like 記帳, not something a company space
 * shares (see FinanceAccessService for the same pattern). */
@Injectable()
export class CalendarAccessService {
  constructor(private readonly spacesService: SpacesService) {}

  async assertCalendarSpace(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.CALENDAR) {
      throw new BadRequestException('行事曆功能僅限行事曆空間使用');
    }
    return space;
  }
}
