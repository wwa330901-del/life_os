import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models/app_user.dart';

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

class AuthResult {
  const AuthResult({required this.accessToken, required this.user});

  final String accessToken;
  final AppUser user;
}

/// Talks to the life_os NestJS API. Phase 1 target is always the local
/// dev backend — see docker-compose.yml at the repo root.
class ApiClient {
  ApiClient({this.baseUrl = 'http://localhost:3000'});

  final String baseUrl;
  String? _token;

  void setToken(String? token) => _token = token;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  /// Returns the email that should be entered on the verification screen —
  /// registering never returns a token, since the account isn't usable until
  /// the emailed code is confirmed.
  Future<String> register({
    required String email,
    required String password,
    required String name,
  }) async {
    final body = await _post('/auth/register', {
      'email': email,
      'password': password,
      'name': name,
    });
    return body['email'] as String;
  }

  Future<AuthResult> verifyEmail({required String email, required String code}) async {
    final body = await _post('/auth/verify-email', {'email': email, 'code': code});
    return _authResultFrom(body);
  }

  Future<void> resendVerification(String email) async {
    await _post('/auth/resend-verification', {'email': email});
  }

  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    final body = await _post('/auth/login', {
      'email': email,
      'password': password,
    });
    return _authResultFrom(body);
  }

  Future<AuthResult> googleLogin({required String code, required String redirectUri}) async {
    final body = await _post('/auth/google', {'code': code, 'redirectUri': redirectUri});
    return _authResultFrom(body);
  }

  Future<AppUser> me() async {
    final body = await _get('/auth/me');
    return AppUser.fromJson(body);
  }

  Future<List<SpaceSummary>> mySpaces() async {
    final body = await _getList('/spaces/me');
    return body
        .map((e) => SpaceSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  AuthResult _authResultFrom(Map<String, dynamic> body) => AuthResult(
    accessToken: body['accessToken'] as String,
    user: AppUser.fromJson(body['user'] as Map<String, dynamic>),
  );

  Future<Map<String, dynamic>> _get(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    return _decodeObject(res);
  }

  Future<List<dynamic>> _getList(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final res = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _decodeObject(res);
  }

  Map<String, dynamic> _decodeObject(http.Response res) {
    final decoded = _checkStatus(res);
    return decoded as Map<String, dynamic>;
  }

  List<dynamic> _decodeList(http.Response res) {
    final decoded = _checkStatus(res);
    return decoded as List<dynamic>;
  }

  dynamic _checkStatus(http.Response res) {
    final decoded = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return decoded;
    }
    final message = (decoded is Map && decoded['message'] != null)
        ? decoded['message'].toString()
        : 'Request failed (${res.statusCode})';
    throw ApiException(res.statusCode, message);
  }
}
