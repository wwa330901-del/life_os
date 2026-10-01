import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { taipeiDateKey } from '../common/taipei-date';
import { ExportService } from './export.service';

@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly service: ExportService) {}

  /** 全部資料一個 Excel 檔。 */
  @Get('xlsx')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async xlsx(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const buffer = await this.service.buildWorkbook(user.id);
    const filename = `元序備份-${taipeiDateKey(new Date()).replace(/-/g, '')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="life_os_backup.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  }
}
