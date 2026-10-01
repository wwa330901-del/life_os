import 'dotenv/config';
import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ErrorReportService } from './error-report/error-report.service';
import { ReportingLogger } from './error-report/reporting-logger';

async function bootstrap() {
  // `rawBody: true` keeps the original request bytes on `req.rawBody`
  // alongside the normal parsed `req.body` — needed by the LINE webhook to
  // verify LINE's HMAC signature, which is computed over the exact raw
  // bytes LINE sent, not a re-serialized version of the parsed JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  // 錯誤自動通報：logger.error 都會用 LINE 通知管理員（見 ErrorReportService）。
  app.useLogger(new ReportingLogger(app.get(ErrorReportService)));
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
