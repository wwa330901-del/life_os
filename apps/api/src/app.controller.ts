import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** 外部確認 Render 現在跑的是哪一版（Render 會自動給 RENDER_GIT_COMMIT）。 */
  @Get('version')
  version() {
    return { commit: (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7) };
  }
}
