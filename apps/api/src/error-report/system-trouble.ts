import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { localizeClientError } from './client-error-text';

/** 使用者遇到系統問題時看到的話（2026-10-02 使用者要求）：細節只通知管理員
 * （ErrorReportService），一般使用者只知道「已通知管理員，修理中」。 */
export const SYSTEM_TROUBLE_MESSAGE = '系統出了點問題，已經通知管理員，正在修理中，請稍後再試 🙏';

/** 500 以上的錯誤：記 log（→ LINE 通知管理員）、回給前端的訊息換成
 * SYSTEM_TROUBLE_MESSAGE，不把英文錯誤或堆疊露給使用者。4xx（格式錯、找
 * 不到…）是使用者自己能處理的，照原本的訊息。 */
@Catch()
export class SystemTroubleFilter extends SentryGlobalFilter {
  private readonly log = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status < 500 && host.getType() === 'http' && exception instanceof HttpException) {
      // 4xx 的英文訊息（程式裡的、欄位檢查的）換成中文，英文原文放 detail
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      const localized = localizeClientError(status, message);
      if (localized) {
        return super.catch(new HttpException({ statusCode: status, message: localized.message, detail: localized.detail }, status), host);
      }
    }
    if (status < 500 || host.getType() !== 'http') return super.catch(exception, host);
    this.log.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return super.catch(new HttpException(SYSTEM_TROUBLE_MESSAGE, status), host);
  }
}
