import { BadRequestException, Controller, Get, INestApplication, Logger } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SYSTEM_TROUBLE_MESSAGE, SystemTroubleFilter } from './system-trouble';

@Controller()
class BoomController {
  @Get('crash')
  crash() {
    throw new TypeError("Cannot read properties of undefined (reading 'id')");
  }

  @Get('bad')
  bad() {
    throw new BadRequestException('金額要大於 0');
  }
}

describe('SystemTroubleFilter', () => {
  let app: INestApplication;
  const logged: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BoomController],
      providers: [{ provide: APP_FILTER, useClass: SystemTroubleFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
      logged.push(String(message));
    });
    await app.init();
  });

  afterAll(() => app.close());

  it('hides crashes behind the 已通知管理員 message but still logs the real error', async () => {
    const res = await request(app.getHttpServer()).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe(SYSTEM_TROUBLE_MESSAGE);
    expect(logged.some((m) => m.includes("reading 'id'"))).toBe(true);
  });

  it('keeps 4xx messages the user can act on', async () => {
    const res = await request(app.getHttpServer()).get('/bad');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('金額要大於 0');
  });
});
