import { BadRequestException, Injectable } from '@nestjs/common';
import { SpacesService } from '../spaces/spaces.service';
import { SpaceType } from '../../generated/prisma/client.js';

/** Every finance-module endpoint is scoped to the caller's own personal
 * space — 記帳 is a solo feature, not something a company space shares. */
@Injectable()
export class FinanceAccessService {
  constructor(private readonly spacesService: SpacesService) {}

  async assertPersonalSpace(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.PERSONAL) {
      throw new BadRequestException('記帳功能僅限個人空間使用');
    }
    return space;
  }
}
