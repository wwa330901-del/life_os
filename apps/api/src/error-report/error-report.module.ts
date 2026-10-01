import { Global, Module } from '@nestjs/common';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { ErrorReportService } from './error-report.service';
import { ClientErrorController } from './client-error.controller';

@Global()
@Module({
  imports: [LineNotifierModule],
  controllers: [ClientErrorController],
  providers: [ErrorReportService],
  exports: [ErrorReportService],
})
export class ErrorReportModule {}
