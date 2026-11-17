import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentSecretPrefix, reencryptSecret } from './secret-box';

/** Catch-up on every start: encrypts secrets still saved as plain text, and (2026-11-17)
 * moves `enc:v1:` (JWT_SECRET-derived) values to `enc:v2:` once DATA_ENCRYPTION_KEY is set.
 * Only touches rows not already on the current prefix, so after the first run it's a no-op.
 * Values that can't be decrypted are left untouched (reencryptSecret returns them as-is). */
@Injectable()
export class SecretMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SecretMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const prefix = currentSecretPrefix();
    const changed = (before: string | null, after: string | null) => before !== after;
    try {
      let gemini = 0;
      let claude = 0;
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            { geminiApiKey: { not: null }, NOT: { geminiApiKey: { startsWith: prefix } } },
            { claudeApiKey: { not: null }, NOT: { claudeApiKey: { startsWith: prefix } } },
          ],
        },
        select: { id: true, geminiApiKey: true, claudeApiKey: true },
      });
      for (const u of users) {
        const geminiApiKey = reencryptSecret(u.geminiApiKey);
        const claudeApiKey = reencryptSecret(u.claudeApiKey);
        if (!changed(u.geminiApiKey, geminiApiKey) && !changed(u.claudeApiKey, claudeApiKey)) continue;
        if (changed(u.geminiApiKey, geminiApiKey)) gemini++;
        if (changed(u.claudeApiKey, claudeApiKey)) claude++;
        await this.prisma.user.update({ where: { id: u.id }, data: { geminiApiKey, claudeApiKey } });
      }

      let apple = 0;
      const connections = await this.prisma.appleCalendarConnection.findMany({
        where: { NOT: { appPassword: { startsWith: prefix } } },
        select: { id: true, appPassword: true },
      });
      for (const c of connections) {
        const appPassword = reencryptSecret(c.appPassword);
        if (!changed(c.appPassword, appPassword)) continue;
        apple++;
        await this.prisma.appleCalendarConnection.update({ where: { id: c.id }, data: { appPassword } });
      }

      let google = 0;
      const googleRows = await this.prisma.googleCalendarConnection.findMany({
        where: {
          OR: [
            { NOT: { refreshToken: { startsWith: prefix } } },
            { accessToken: { not: null }, NOT: { accessToken: { startsWith: prefix } } },
          ],
        },
        select: { id: true, refreshToken: true, accessToken: true },
      });
      for (const g of googleRows) {
        const refreshToken = reencryptSecret(g.refreshToken);
        const accessToken = reencryptSecret(g.accessToken);
        if (!changed(g.refreshToken, refreshToken) && !changed(g.accessToken, accessToken)) continue;
        google++;
        await this.prisma.googleCalendarConnection.update({ where: { id: g.id }, data: { refreshToken, accessToken } });
      }

      if (gemini + claude + apple + google > 0) {
        this.logger.log(
          `已加密（${prefix}）${gemini} 個 Gemini 金鑰、${claude} 個 Claude 金鑰、${apple} 個 iCloud 密碼、${google} 個 Google 行事曆授權`,
        );
      }
    } catch (error) {
      this.logger.error('舊資料加密失敗（下次啟動會再試）', error as Error);
    }
  }
}
