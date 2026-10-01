import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './jwt-payload';
import { UsersService } from '../users/users.service';
import { clientIp, UserLocationService } from '../users/user-location.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly location: UserLocationService,
  ) {}

  // 帳號相關端點（註冊/驗證/登入）比全域預設（每分鐘 100 次）收得更緊——
  // 每分鐘 5 次，擋暴力破解密碼/濫發驗證信，一般使用者打錯密碼幾次也還
  // 在範圍內，不會誤擋正常使用。
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('google')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersService.findById(currentUser.id);
    return {
      id: user!.id,
      username: user!.username,
      email: user!.email,
      name: user!.name,
      isPlatformAdmin: user!.isPlatformAdmin,
    };
  }

  /** App 開啟時呼叫：用連線的公網 IP 估使用者在哪個城市（問天氣沒講地點用）。
   * 不回傳座標，只回城市名稱。 */
  @UseGuards(JwtAuthGuard)
  @Post('me/location')
  async reportLocation(@CurrentUser() currentUser: AuthenticatedUser, @Req() req: Request) {
    const ip = clientIp(req.headers['x-forwarded-for'], req.socket?.remoteAddress);
    const location = await this.location.updateFromIp(currentUser.id, ip);
    return { name: location?.name ?? null, source: location?.source ?? null };
  }

  /** Self-service display-name change — any logged-in user, not just a
   * platform admin (who can only view accounts, not edit them). */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    const user = await this.usersService.updateName(currentUser.id, dto.name.trim());
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
