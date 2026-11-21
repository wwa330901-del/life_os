class AppUser {
  const AppUser({
    required this.id,
    required this.username,
    required this.email,
    required this.name,
    required this.isPlatformAdmin,
    this.appTheme,
    this.appLayout,
    this.onboarded = true,
  });

  final String id;
  final String username;
  final String email;
  final String name;
  final bool isPlatformAdmin;

  /// 外觀風格 id（core/theme/app_themes.dart）；null＝還沒選過
  final String? appTheme;

  /// 版面 id（state/app_layout_provider.dart）；null＝還沒選過
  final String? appLayout;

  /// 新手引導做完（或跳過）了沒；舊版伺服器沒這個欄位就當作做完。
  final bool onboarded;

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    username: json['username'] as String,
    email: json['email'] as String,
    name: json['name'] as String,
    isPlatformAdmin: json['isPlatformAdmin'] as bool? ?? false,
    appTheme: json['appTheme'] as String?,
    appLayout: json['appLayout'] as String?,
    onboarded: json['onboarded'] as bool? ?? true,
  );

  AppUser copyWith({bool? onboarded}) => AppUser(
    id: id,
    username: username,
    email: email,
    name: name,
    isPlatformAdmin: isPlatformAdmin,
    appTheme: appTheme,
    appLayout: appLayout,
    onboarded: onboarded ?? this.onboarded,
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
