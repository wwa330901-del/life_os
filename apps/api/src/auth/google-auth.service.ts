import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
}

/// Exchanges an OAuth authorization code (from the Flutter app's system-browser
/// + loopback-redirect flow) for tokens, then verifies the ID token server-side
/// so the client_secret never has to live in the distributed desktop binary.
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  async exchangeCodeForProfile(
    code: string,
    redirectUri: string,
  ): Promise<GoogleProfile> {
    // 授權碼只能用一次、幾分鐘就過期（invalid_grant）：是使用者要重按一次，
    // 不是系統壞掉，回 401 中文訊息，不要變成 500 去通知管理員。
    let tokens: { id_token?: string | null };
    try {
      ({ tokens } = await this.client.getToken({
        code,
        redirect_uri: redirectUri,
      }));
    } catch (error) {
      this.logger.warn(`Google 登入授權碼交換失敗：${error}`);
      throw new UnauthorizedException(
        'Google 授權已失效，請再按一次「使用 Google 登入」。',
      );
    }
    if (!tokens.id_token) {
      throw new UnauthorizedException('Google did not return an ID token');
    }

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
    };
  }
}
