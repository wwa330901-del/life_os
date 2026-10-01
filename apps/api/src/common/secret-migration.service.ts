import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret } from './secret-box';

const ENC = 'enc:v1:';

/** One-time catch-up (2026-10-01): encrypts Gemini keys / iCloud passwords saved as plain
 * text before secret-box existed. Runs on every start but only touches plaintext rows,
 * so after the first run it's a no-op. */
@Injectable()
export class SecretMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SecretMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const users = await this.prisma.user.findMany({
        where: { geminiApiKey: { not: null }, NOT: { geminiApiKey: { startsWith: ENC } } },
        select: { id: true, geminiApiKey: true },
      });
      for (const u of users) {
        await this.prisma.user.update({ where: { id: u.id }, data: { geminiApiKey: encryptSecret(u.geminiApiKey) } });
      }
      const connections = await this.prisma.appleCalendarConnection.findMany({
        where: { NOT: { appPassword: { startsWith: ENC } } },
        select: { id: true, appPassword: true },
      });
      for (const c of connections) {
        await this.prisma.appleCalendarConnection.update({ where: { id: c.id }, data: { appPassword: encryptSecret(c.appPassword) } });
      }
      if (users.length + connections.length > 0) {
        this.logger.log(`已加密 ${users.length} 個 Gemini 金鑰、${connections.length} 個 iCloud 密碼`);
      }
    } catch (error) {
      this.logger.error('舊資料加密失敗（下次啟動會再試）', error as Error);
    }
  }
}
