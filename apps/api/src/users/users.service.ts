import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  createWithPassword(data: {
    email: string;
    passwordHash: string;
    name: string;
    verificationCode: string;
    verificationCodeExpiresAt: Date;
  }) {
    return this.prisma.user.create({ data });
  }

  createFromGoogle(data: { email: string; name: string; googleId: string }) {
    return this.prisma.user.create({
      data: { ...data, emailVerifiedAt: new Date() },
    });
  }

  linkGoogleId(userId: string, googleId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { googleId },
    });
  }

  setVerificationCode(userId: string, code: string, expiresAt: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { verificationCode: code, verificationCodeExpiresAt: expiresAt },
    });
  }

  markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        verificationCode: null,
        verificationCodeExpiresAt: null,
      },
    });
  }
}
