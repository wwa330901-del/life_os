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
