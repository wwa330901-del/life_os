import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Used to resolve a KnowledgeCategory.blacklistedUserIds array back into
   * display-able {id, name, email} entries — plain scalar array, no
   * relation to join through. */
  findManyByIds(ids: string[]) {
    return this.prisma.user.findMany({ where: { id: { in: ids } } });
  }

  findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  createWithPassword(data: {
    username: string;
    email: string;
    passwordHash: string;
    name: string;
    verificationCode: string;
    verificationCodeExpiresAt: Date;
  }) {
    return this.prisma.user.create({ data });
  }

  createFromGoogle(data: {
    username: string;
    email: string;
    name: string;
    googleId: string;
  }) {
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

  /** Self-service: any logged-in user can change their own display name
   * (distinct from the platform-admin user list, which is read-only). */
  updateName(userId: string, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
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

  /// Google sign-in doesn't provide a username, so derive one from the
  /// email's local part and disambiguate against existing accounts.
  async generateUniqueUsernameFromEmail(email: string): Promise<string> {
    const base =
      email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_]/g, '')
        .slice(0, 15) || 'user';

    let candidate = base;
    let suffix = 0;
    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }
}
