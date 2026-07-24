import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { SpacesService } from '../spaces/spaces.service';
import { EmailService } from '../email/email.service';
import { GoogleAuthService } from './google-auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

const SALT_ROUNDS = 10;
const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;

interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly spacesService: SpacesService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  async register(dto: RegisterDto) {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }
    const existingUsername = await this.usersService.findByUsername(
      dto.username,
    );
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const code = this.generateVerificationCode();
    const user = await this.usersService.createWithPassword({
      username: dto.username,
      email: dto.email,
      passwordHash,
      name: dto.name,
      verificationCode: code,
      verificationCodeExpiresAt: new Date(
        Date.now() + VERIFICATION_CODE_TTL_MS,
      ),
    });

    await this.spacesService.createPersonalSpace(user.id, user.name);
    await this.emailService.sendVerificationCode(user.email, code);

    return { email: user.email, message: '請查看信箱輸入驗證碼' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (
      !user ||
      user.verificationCode !== dto.code ||
      !user.verificationCodeExpiresAt ||
      user.verificationCodeExpiresAt < new Date()
    ) {
      throw new BadRequestException('驗證碼錯誤或已過期');
    }

    const verified = await this.usersService.markEmailVerified(user.id);
    return this.buildAuthResponse(verified);
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('找不到這個帳號');
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('這個帳號已經驗證過了');
    }

    const code = this.generateVerificationCode();
    await this.usersService.setVerificationCode(
      user.id,
      code,
      new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
    );
    await this.emailService.sendVerificationCode(user.email, code);
    return { message: '驗證碼已重新寄出' };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        '此帳號使用 Google 登入，請用 Google 登入',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('請先完成信箱驗證');
    }

    return this.buildAuthResponse(user);
  }

  async googleLogin(dto: GoogleLoginDto) {
    const profile = await this.googleAuthService.exchangeCodeForProfile(
      dto.code,
      dto.redirectUri,
    );

    let user = await this.usersService.findByGoogleId(profile.googleId);
    if (!user) {
      const existingByEmail = await this.usersService.findByEmail(
        profile.email,
      );
      if (existingByEmail) {
        user = await this.usersService.linkGoogleId(
          existingByEmail.id,
          profile.googleId,
        );
        if (!existingByEmail.emailVerifiedAt) {
          user = await this.usersService.markEmailVerified(user.id);
        }
      } else {
        const username =
          await this.usersService.generateUniqueUsernameFromEmail(
            profile.email,
          );
        user = await this.usersService.createFromGoogle({
          username,
          email: profile.email,
          name: profile.name,
          googleId: profile.googleId,
        });
        await this.spacesService.createPersonalSpace(user.id, user.name);
      }
    }

    return this.buildAuthResponse(user);
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private buildAuthResponse(user: AuthUser) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    };
  }
}
