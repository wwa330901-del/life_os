class AppUser {
  const AppUser({
    required this.id,
    required this.username,
    required this.email,
    required this.name,
    required this.isPlatformAdmin,
    this.appTheme,
  });

  final String id;
  final String username;
  final String email;
  final String name;
  final bool isPlatformAdmin;

  /// 外觀風格 id（core/theme/app_themes.dart）；null＝還沒選過
  final String? appTheme;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    username: json['username'] as String,
    email: json['email'] as String,
    name: json['name'] as String,
    isPlatformAdmin: json['isPlatformAdmin'] as bool? ?? false,
    appTheme: json['appTheme'] as String?,
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
