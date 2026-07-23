import { Injectable, UnauthorizedException } from '@nestjs/common';
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
  private readonly client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );

  async exchangeCodeForProfile(
    code: string,
    redirectUri: string,
  ): Promise<GoogleProfile> {
    const { tokens } = await this.client.getToken({
      code,
      redirect_uri: redirectUri,
    });
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
