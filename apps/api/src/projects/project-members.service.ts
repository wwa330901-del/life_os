import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { ProjectsService } from './projects.service';
import { MembershipRole, ProjectRole } from '../../generated/prisma/client.js';
import type { Project } from '../../generated/prisma/client.js';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spacesService: SpacesService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Anyone who can already see the project (see `ProjectsService.assertAccess`) can view its member list. */
  async list(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, username: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    }));
  }

  async add(userId: string, projectId: string, dto: AddProjectMemberDto) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.assertCanManage(userId, project);

    const existing = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: dto.userId, projectId } },
    });
    if (existing) {
      throw new BadRequestException('這個人已經是專案成員了');
    }
    await this.prisma.projectMember.create({
      data: { userId: dto.userId, projectId, role: dto.role as ProjectRole },
    });
  }

  async updateRole(
    userId: string,
    projectId: string,
    targetUserId: string,
    dto: UpdateProjectMemberRoleDto,
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.assertCanManage(userId, project);
    const membership = await this.getMembershipOrThrow(projectId, targetUserId);

    if (membership.role === ProjectRole.PM && dto.role !== 'PM') {
      await this.assertNotLastPm(projectId, targetUserId);
    }
    await this.prisma.projectMember.update({
      where: { userId_projectId: { userId: targetUserId, projectId } },
      data: { role: dto.role as ProjectRole },
    });
  }

  async remove(userId: string, projectId: string, targetUserId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.assertCanManage(userId, project);
    const membership = await this.getMembershipOrThrow(projectId, targetUserId);

    if (membership.role === ProjectRole.PM) {
      await this.assertNotLastPm(projectId, targetUserId);
    }
    await this.prisma.projectMember.delete({
      where: { userId_projectId: { userId: targetUserId, projectId } },
    });
  }

  /**
   * Only a project PM or the space's own OWNER/ADMIN may add/remove/
   * re-role members — a regular project member can see the list but not
   * change it (this is our own default, not something the user asked for
   * explicitly; loosen it later if a plain member should be able to
   * self-serve invites).
   */
  private async assertCanManage(userId: string, project: Project): Promise<void> {
    await this.projectsService.assertAccess(userId, project);
    const space = await this.spacesService.getForUserOrThrow(userId, project.spaceId);
    if (space.role === MembershipRole.OWNER || space.role === MembershipRole.ADMIN) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId: project.id } },
    });
    if (membership?.role !== ProjectRole.PM) {
      throw new ForbiddenException('只有專案負責人或空間管理者可以管理專案成員');
    }
  }

  /** A project must always keep at least one PM — refuse to demote/remove the last one. */
  private async assertNotLastPm(projectId: string, excludingUserId: string): Promise<void> {
    const otherPmCount = await this.prisma.projectMember.count({
      where: { projectId, role: ProjectRole.PM, userId: { not: excludingUserId } },
    });
    if (otherPmCount === 0) {
      throw new BadRequestException('專案至少要保留一位負責人');
    }
  }

  private async getMembershipOrThrow(projectId: string, userId: string) {
    const membership = await this.prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }
    return membership;
  }
}
