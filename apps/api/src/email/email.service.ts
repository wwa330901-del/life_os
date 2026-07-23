import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  // Resend's shared sandbox sender — works with no domain setup. Swap for a
  // verified custom domain address once one is configured in Resend.
  private readonly from =
    process.env.EMAIL_FROM ?? 'life_os <onboarding@resend.dev>';

  async sendVerificationCode(to: string, code: string) {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: `life_os 驗證碼：${code}`,
      html: `
        <p>你的 life_os 註冊驗證碼是：</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
        <p>15 分鐘內有效。如果不是你本人操作，請忽略這封信。</p>
      `,
    });

    if (error) {
      this.logger.error(
        `Failed to send verification email to ${to}: ${JSON.stringify(error)}`,
      );
      throw new Error('Failed to send verification email');
    }
  }
}
