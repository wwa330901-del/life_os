import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { LineService } from './line.service';

interface LineWebhookBody {
  events?: unknown[];
}

/** No `JwtAuthGuard` here — the caller is LINE's servers, not an
 * app user, so authentication is the HMAC signature check instead
 * (`x-line-signature`, verified against the raw request body). */
@Controller('line')
export class LineWebhookController {
  constructor(private readonly lineService: LineService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-line-signature') signature: string | undefined,
    @Body() body: LineWebhookBody,
  ) {
    if (!req.rawBody || !this.lineService.verifySignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid LINE signature');
    }
    await this.lineService.handleEvents((body.events ?? []) as Parameters<LineService['handleEvents']>[0]);
    return {};
  }
}
