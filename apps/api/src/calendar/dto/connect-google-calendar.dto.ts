import { IsString, IsUrl } from 'class-validator';

export class ConnectGoogleCalendarDto {
  @IsString()
  code: string;

  /// Same loopback-redirect convention as GoogleLoginDto — must match what
  /// was sent to Google's authorization endpoint for this consent request.
  @IsUrl({ require_tld: false })
  redirectUri: string;
}
