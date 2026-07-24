import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models/admin_models.dart';
import 'models/app_user.dart';
import 'models/project.dart';
import 'models/schedule_result.dart';
import 'models/work_item.dart';

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

/// Talks to the life_os NestJS API, deployed on Render (free tier — the
/// first request after a period of inactivity can take 30-60s to wake up).
/// Backed by Supabase PostgreSQL.
class ApiClient {
  ApiClient({this.baseUrl = 'https://life-os-api-yhh2.onrender.com'});

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
    required String username,
    required String email,
    required String password,
    required String name,
  }) async {
    final body = await _post('/auth/register', {
      'username': username,
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
    required String username,
    required String password,
  }) async {
    final body = await _post('/auth/login', {
      'username': username,
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

  Future<List<AdminUserSummary>> adminListUsers() async {
    final body = await _getList('/admin/users');
    return body
        .map((e) => AdminUserSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<AdminSpaceSummary>> adminListSpaces() async {
    final body = await _getList('/admin/spaces');
    return body
        .map((e) => AdminSpaceSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<AdminSpaceDetail> adminGetSpace(String spaceId) async {
    final body = await _get('/admin/spaces/$spaceId');
    return AdminSpaceDetail.fromJson(body);
  }

  Future<void> adminCreateSpace(String name) async {
    await _post('/admin/spaces', {'name': name});
  }

  Future<void> adminAddMember({
    required String spaceId,
    required String username,
    required MembershipRole role,
  }) async {
    await _post('/admin/spaces/$spaceId/members', {
      'username': username,
      'role': role.toJson(),
    });
  }

  Future<void> adminUpdateMemberRole({
    required String spaceId,
    required String userId,
    required MembershipRole role,
  }) async {
    await _patch('/admin/spaces/$spaceId/members/$userId', {'role': role.toJson()});
  }

  Future<void> adminRemoveMember({required String spaceId, required String userId}) async {
    await _delete('/admin/spaces/$spaceId/members/$userId');
  }

  Future<List<Project>> listProjects(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/projects');
    return body.map((e) => Project.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Project> createProject({
    required String spaceId,
    required String name,
    String? clientName,
    String? siteAddress,
    required DateTime projectStartDate,
  }) async {
    final body = await _post('/spaces/$spaceId/projects', {
      'name': name,
      if (clientName != null) 'clientName': clientName,
      if (siteAddress != null) 'siteAddress': siteAddress,
      'projectStartDate': _dateOnly(projectStartDate),
    });
    return Project.fromJson(body);
  }

  Future<Project> getProject(String projectId) async {
    final body = await _get('/projects/$projectId');
    return Project.fromJson(body);
  }

  Future<void> deleteProject(String projectId) async {
    await _delete('/projects/$projectId');
  }

  Future<ScheduleResult> getSchedule(String projectId) async {
    final body = await _get('/projects/$projectId/schedule');
    return ScheduleResult.fromJson(body);
  }

  Future<List<WorkItem>> listWorkItems(String projectId) async {
    final body = await _getList('/projects/$projectId/work-items');
    return body.map((e) => WorkItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Date-only string (no time-of-day, no timezone) — the backend column is
  /// `@db.Date`; sending a full ISO timestamp here would risk the calendar
  /// date shifting by a day depending on local vs. UTC offsets.
  String _dateOnly(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

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

  Future<Map<String, dynamic>> _patch(
    String path,
    Map<String, dynamic> body,
  ) async {
    final res = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
    return _decodeObject(res);
  }

  Future<void> _delete(String path) async {
    final res = await http.delete(Uri.parse('$baseUrl$path'), headers: _headers);
    _checkStatus(res);
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
