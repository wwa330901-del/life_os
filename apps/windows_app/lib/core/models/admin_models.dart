import 'app_user.dart';

enum MembershipRole { owner, admin, member }

extension MembershipRoleJson on MembershipRole {
  static MembershipRole fromJson(String value) => switch (value) {
    'OWNER' => MembershipRole.owner,
    'ADMIN' => MembershipRole.admin,
    _ => MembershipRole.member,
  };

  String toJson() => switch (this) {
    MembershipRole.owner => 'OWNER',
    MembershipRole.admin => 'ADMIN',
    MembershipRole.member => 'MEMBER',
  };

  String get label => switch (this) {
    MembershipRole.owner => '擁有者',
    MembershipRole.admin => '管理員',
    MembershipRole.member => '成員',
  };
}

class AdminUserSummary {
  const AdminUserSummary({
    required this.id,
    required this.username,
    required this.email,
    required this.name,
    required this.createdAt,
    required this.emailVerified,
    required this.isPlatformAdmin,
    required this.hasGoogleLogin,
  });

  final String id;
  final String username;
  final String email;
  final String name;
  final DateTime createdAt;
  final bool emailVerified;
  final bool isPlatformAdmin;
  final bool hasGoogleLogin;

  factory AdminUserSummary.fromJson(Map<String, dynamic> json) => AdminUserSummary(
    id: json['id'] as String,
    username: json['username'] as String,
    email: json['email'] as String,
    name: json['name'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
    emailVerified: json['emailVerifiedAt'] != null,
    isPlatformAdmin: json['isPlatformAdmin'] as bool,
    hasGoogleLogin: json['hasGoogleLogin'] as bool,
  );
}

class AdminSpaceSummary {
  const AdminSpaceSummary({
    required this.id,
    required this.type,
    required this.name,
    required this.memberCount,
    required this.personalOwnerName,
  });

  final String id;
  final SpaceType type;
  final String name;
  final int? memberCount;
  final String? personalOwnerName;

  factory AdminSpaceSummary.fromJson(Map<String, dynamic> json) => AdminSpaceSummary(
    id: json['id'] as String,
    type: (json['type'] as String) == 'PERSONAL' ? SpaceType.personal : SpaceType.company,
    name: json['name'] as String,
    memberCount: json['memberCount'] as int?,
    personalOwnerName: json['personalOwnerName'] as String?,
  );
}

class AdminSpaceMember {
  const AdminSpaceMember({
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
  final MembershipRole role;

  factory AdminSpaceMember.fromJson(Map<String, dynamic> json) => AdminSpaceMember(
    userId: json['userId'] as String,
    username: json['username'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    role: MembershipRoleJson.fromJson(json['role'] as String),
  );
}

class AdminSpaceDetail {
  const AdminSpaceDetail({
    required this.id,
    required this.type,
    required this.name,
    required this.members,
  });

  final String id;
  final SpaceType type;
  final String name;
  final List<AdminSpaceMember> members;

  factory AdminSpaceDetail.fromJson(Map<String, dynamic> json) => AdminSpaceDetail(
    id: json['id'] as String,
    type: (json['type'] as String) == 'PERSONAL' ? SpaceType.personal : SpaceType.company,
    name: json['name'] as String,
    members: (json['members'] as List<dynamic>)
        .map((e) => AdminSpaceMember.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
