import { IsString, IsUrl } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  code: string;

  /// The loopback redirect URI (e.g. http://127.0.0.1:PORT) the Flutter app
  /// registered for this particular auth attempt — must match what was sent
  /// to Google's authorization endpoint.
  @IsUrl({ require_tld: false })
  redirectUri: string;
}
