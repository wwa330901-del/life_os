class AppUser {
  const AppUser({required this.id, required this.email, required this.name});

  final String id;
  final String email;
  final String name;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    email: json['email'] as String,
    name: json['name'] as String,
  );
}

enum SpaceType { personal, company }

class SpaceSummary {
  const SpaceSummary({
    required this.id,
    required this.type,
    required this.name,
    required this.role,
  });

  final String id;
  final SpaceType type;
  final String name;

  /// Null for a personal space. One of OWNER / ADMIN / MEMBER for a company space.
  final String? role;

  factory SpaceSummary.fromJson(Map<String, dynamic> json) => SpaceSummary(
    id: json['id'] as String,
    type: (json['type'] as String) == 'PERSONAL'
        ? SpaceType.personal
        : SpaceType.company,
    name: json['name'] as String,
    role: json['role'] as String?,
  );
}
