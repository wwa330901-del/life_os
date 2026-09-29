import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        createdAt: true,
        emailVerifiedAt: true,
        isPlatformAdmin: true,
        googleId: true,
      },
    });
    return users.map(({ googleId, ...u }) => ({
      ...u,
      hasGoogleLogin: googleId !== null,
    }));
  }
}
