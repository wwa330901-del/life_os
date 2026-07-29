import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody: true` keeps the original request bytes on `req.rawBody`
  // alongside the normal parsed `req.body` — needed by the LINE webhook to
  // verify LINE's HMAC signature, which is computed over the exact raw
  // bytes LINE sent, not a re-serialized version of the parsed JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
