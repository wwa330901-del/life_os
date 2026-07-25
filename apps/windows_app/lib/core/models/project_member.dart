enum ProjectRole { pm, member }

ProjectRole projectRoleFromJson(String value) => value == 'PM' ? ProjectRole.pm : ProjectRole.member;

String projectRoleToJson(ProjectRole role) => role == ProjectRole.pm ? 'PM' : 'MEMBER';

/// One member of a project (`GET /projects/:id/members`).
class ProjectMember {
  const ProjectMember({
    required this.userId,
    required this.username,
    required this.name,
    required this.email,
    required this.role,
  });

  final String userId;
  final String username;
  final String name;
  final String email;
  final ProjectRole role;

  factory ProjectMember.fromJson(Map<String, dynamic> json) => ProjectMember(
    userId: json['userId'] as String,
    username: json['username'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    role: projectRoleFromJson(json['role'] as String),
  );
}

/// One member of a *space* (`GET /spaces/:id/members`) — feeds the "who can
/// I add to this project" picker. `role` is the space-level role (OWNER/
/// ADMIN/MEMBER), left as a raw string like [SpaceSummary.role] already is
/// elsewhere in this app rather than introducing a second role enum for a
/// value nothing here needs to branch on besides display.
class SpaceMember {
  const SpaceMember({
    required this.userId,
    required this.username,
    required this.name,
    required this.email,
    required this.role,
  });

  final String userId;
  final String username;
  final String name;
  final String email;
  final String role;

  factory SpaceMember.fromJson(Map<String, dynamic> json) => SpaceMember(
    userId: json['userId'] as String,
    username: json['username'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    role: json['role'] as String,
  );
}
