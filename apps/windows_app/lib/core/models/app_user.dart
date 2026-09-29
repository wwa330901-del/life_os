class AppUser {
  const AppUser({
    required this.id,
    required this.username,
    required this.email,
    required this.name,
    required this.isPlatformAdmin,
  });

  final String id;
  final String username;
  final String email;
  final String name;
  final bool isPlatformAdmin;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    username: json['username'] as String,
    email: json['email'] as String,
    name: json['name'] as String,
    isPlatformAdmin: json['isPlatformAdmin'] as bool? ?? false,
  );
}

enum SpaceType { personal, calendar }

class SpaceSummary {
  const SpaceSummary({required this.id, required this.type, required this.name});

  final String id;
  final SpaceType type;
  final String name;

  factory SpaceSummary.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String;
    return SpaceSummary(
      id: json['id'] as String,
      type: typeStr == 'CALENDAR' ? SpaceType.calendar : SpaceType.personal,
      name: json['name'] as String,
    );
  }
}
