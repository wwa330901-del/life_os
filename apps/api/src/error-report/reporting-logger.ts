import { ConsoleLogger } from '@nestjs/common';
import type { ErrorReportService } from './error-report.service';

/** Nest's console logger, plus every `logger.error(...)` (failed cron jobs, unhandled 500s
 * logged by Nest's ExceptionsHandler, …) goes to ErrorReportService. */
export class ReportingLogger extends ConsoleLogger {
  constructor(private readonly reporter: ErrorReportService) {
    super();
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);
    const params = [...optionalParams];
    const context = typeof params[params.length - 1] === 'string' && params.length > 1 ? (params.pop() as string) : undefined;
    const errorParam = params.find((p) => p instanceof Error);
    const stack = errorParam?.stack ?? params.find((p): p is string => typeof p === 'string');
    const text = message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message);
    const detail = errorParam && errorParam.message !== text ? `${errorParam.message}\n${errorParam.stack ?? ''}` : stack;
    void this.reporter.report(context ?? 'Server', text, detail);
  }
}
