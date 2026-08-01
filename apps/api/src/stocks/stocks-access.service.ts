import { BadRequestException, Injectable } from '@nestjs/common';
import { SpacesService } from '../spaces/spaces.service';
import { SpaceType } from '../../generated/prisma/client.js';

/** Every 投資 endpoint is scoped to the caller's own personal space, same as
 * 記帳 — investing is a solo feature, not something a company space shares. */
@Injectable()
export class StocksAccessService {
  constructor(private readonly spacesService: SpacesService) {}

  async assertPersonalSpace(userId: string, spaceId: string) {
    const space = await this.spacesService.getForUserOrThrow(userId, spaceId);
    if (space.type !== SpaceType.PERSONAL) {
      throw new BadRequestException('投資功能僅限個人空間使用');
    }
    return space;
  }
}
