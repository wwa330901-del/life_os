import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models/admin_models.dart';
import 'models/app_user.dart';
import 'models/project.dart';
import 'models/project_member.dart';
import 'models/project_property.dart';
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

  Future<List<SpaceMember>> listSpaceMembers(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/members');
    return body.map((e) => SpaceMember.fromJson(e as Map<String, dynamic>)).toList();
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
    required DateTime projectStartDate,
    List<PropertyValueInput> propertyValues = const [],
  }) async {
    final body = await _post('/spaces/$spaceId/projects', {
      'name': name,
      'projectStartDate': _dateOnly(projectStartDate),
      if (propertyValues.isNotEmpty)
        'propertyValues': propertyValues.map((v) => v.toJson()).toList(),
    });
    return Project.fromJson(body);
  }

  Future<List<PropertyDefinition>> listPropertyDefinitions(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/properties');
    return body.map((e) => PropertyDefinition.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createPropertyDefinition({
    required String spaceId,
    required String name,
    required PropertyType type,
  }) async {
    await _post('/spaces/$spaceId/properties', {
      'name': name,
      'type': propertyTypeToJson(type),
    });
  }

  Future<void> renamePropertyDefinition({
    required String spaceId,
    required String definitionId,
    required String name,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/properties/$definitionId', {'name': name});
  }

  Future<void> deletePropertyDefinition({required String spaceId, required String definitionId}) async {
    await _delete('/spaces/$spaceId/properties/$definitionId');
  }

  Future<void> addPropertyOption({
    required String spaceId,
    required String definitionId,
    required String label,
  }) async {
    await _post('/spaces/$spaceId/properties/$definitionId/options', {'label': label});
  }

  Future<void> renamePropertyOption({
    required String spaceId,
    required String definitionId,
    required String optionId,
    required String label,
  }) async {
    await _patchIgnoreBody(
      '/spaces/$spaceId/properties/$definitionId/options/$optionId',
      {'label': label},
    );
  }

  Future<void> deletePropertyOption({
    required String spaceId,
    required String definitionId,
    required String optionId,
  }) async {
    await _delete('/spaces/$spaceId/properties/$definitionId/options/$optionId');
  }

  Future<List<ProjectOption>> listProjectTypeOptions() async {
    final body = await _getList('/project-options/types');
    return body.map((e) => ProjectOption.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<ProjectOption>> listProjectStatusOptions() async {
    final body = await _getList('/project-options/statuses');
    return body.map((e) => ProjectOption.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> adminCreateProjectTypeOption(String label) async {
    await _post('/admin/project-options/types', {'label': label});
  }

  Future<void> adminRenameProjectTypeOption(String id, String label) async {
    await _patchIgnoreBody('/admin/project-options/types/$id', {'label': label});
  }

  Future<void> adminDeleteProjectTypeOption(String id) async {
    await _delete('/admin/project-options/types/$id');
  }

  Future<void> adminCreateProjectStatusOption(String label) async {
    await _post('/admin/project-options/statuses', {'label': label});
  }

  Future<void> adminRenameProjectStatusOption(String id, String label) async {
    await _patchIgnoreBody('/admin/project-options/statuses/$id', {'label': label});
  }

  Future<void> adminDeleteProjectStatusOption(String id) async {
    await _delete('/admin/project-options/statuses/$id');
  }

  Future<Project> getProject(String projectId) async {
    final body = await _get('/projects/$projectId');
    return Project.fromJson(body);
  }

  /// Every field is "not sent" when omitted (unchanged) — same convention
  /// as [updateWorkItem].
  Future<Project> updateProject({
    required String projectId,
    String? name,
    DateTime? projectStartDate,
    List<PropertyValueInput> propertyValues = const [],
  }) async {
    final body = await _patch('/projects/$projectId', {
      if (name != null) 'name': name,
      if (projectStartDate != null) 'projectStartDate': _dateOnly(projectStartDate),
      if (propertyValues.isNotEmpty)
        'propertyValues': propertyValues.map((v) => v.toJson()).toList(),
    });
    return Project.fromJson(body);
  }

  Future<void> deleteProject(String projectId) async {
    await _delete('/projects/$projectId');
  }

  Future<ScheduleResult> getSchedule(String projectId) async {
    final body = await _get('/projects/$projectId/schedule');
    return ScheduleResult.fromJson(body);
  }

  /// Project + work items + computed schedule in one request — what the
  /// schedule tab actually needs after every edit. One HTTP round trip
  /// instead of three separately (even fired concurrently, each of those
  /// three re-checked project/space/membership access from scratch, which
  /// is most of why editing still felt slow after parallelizing them
  /// client-side didn't fully fix it).
  Future<({Project project, List<WorkItem> items, ScheduleResult schedule})> getProjectEditorState(
    String projectId,
  ) async {
    final body = await _get('/projects/$projectId/editor-state');
    return (
      project: Project.fromJson(body['project'] as Map<String, dynamic>),
      items: (body['items'] as List<dynamic>)
          .map((e) => WorkItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      schedule: ScheduleResult.fromJson(body['schedule'] as Map<String, dynamic>),
    );
  }

  Future<List<WorkItem>> listWorkItems(String projectId) async {
    final body = await _getList('/projects/$projectId/work-items');
    return body.map((e) => WorkItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<WorkItem> createWorkItem({
    required String projectId,
    required String name,
    required int durationDays,
    String? parentId,
    List<String>? predecessorIds,
  }) async {
    final body = await _post('/projects/$projectId/work-items', {
      'name': name,
      'durationDays': durationDays,
      if (parentId != null) 'parentId': parentId,
      if (predecessorIds != null) 'predecessorIds': predecessorIds,
    });
    return WorkItem.fromJson(body);
  }

  /// Every field is "not sent" when omitted (unchanged) vs. explicitly
  /// `null` (cleared) — see UpdateWorkItemDto on the backend. Passing
  /// `clearManualStartDate: true` sends manualStartDate as null.
  Future<WorkItem> updateWorkItem({
    required String projectId,
    required String workItemId,
    String? name,
    int? durationDays,
    List<String>? predecessorIds,
    DateTime? manualStartDate,
    bool clearManualStartDate = false,
    bool? isManuallyPinned,
    String? parentId,
    bool clearParentId = false,
  }) async {
    final body = await _patch('/projects/$projectId/work-items/$workItemId', {
      if (name != null) 'name': name,
      if (durationDays != null) 'durationDays': durationDays,
      if (predecessorIds != null) 'predecessorIds': predecessorIds,
      if (clearManualStartDate)
        'manualStartDate': null
      else if (manualStartDate != null)
        'manualStartDate': _dateOnly(manualStartDate),
      if (isManuallyPinned != null) 'isManuallyPinned': isManuallyPinned,
      if (clearParentId)
        'parentId': null
      else if (parentId != null)
        'parentId': parentId,
    });
    return WorkItem.fromJson(body);
  }

  Future<void> deleteWorkItem({required String projectId, required String workItemId}) async {
    await _delete('/projects/$projectId/work-items/$workItemId');
  }

  Future<void> reorderWorkItem({
    required String projectId,
    required String workItemId,
    required String targetId,
    required bool insertAfter,
  }) async {
    await _patchIgnoreBody('/projects/$projectId/work-items/$workItemId/reorder', {
      'targetId': targetId,
      'insertAfter': insertAfter,
    });
  }

  Future<Project> updateCalendar({
    required String projectId,
    required List<int> weeklyOffDays,
    required bool useTaiwanGovernmentCalendar,
    required Set<DateTime> adHocHolidays,
    required Set<DateTime> adHocWorkdays,
  }) async {
    final body = await _patch('/projects/$projectId/calendar', {
      'weeklyOffDays': weeklyOffDays,
      'useTaiwanGovernmentCalendar': useTaiwanGovernmentCalendar,
      'adHocHolidays': adHocHolidays.map(_dateOnly).toList(),
      'adHocWorkdays': adHocWorkdays.map(_dateOnly).toList(),
    });
    return Project.fromJson(body);
  }

  Future<List<ProjectMember>> listProjectMembers(String projectId) async {
    final body = await _getList('/projects/$projectId/members');
    return body.map((e) => ProjectMember.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addProjectMember({
    required String projectId,
    required String userId,
    required ProjectRole role,
  }) async {
    await _post('/projects/$projectId/members', {
      'userId': userId,
      'role': projectRoleToJson(role),
    });
  }

  Future<void> updateProjectMemberRole({
    required String projectId,
    required String userId,
    required ProjectRole role,
  }) async {
    await _patchIgnoreBody('/projects/$projectId/members/$userId', {
      'role': projectRoleToJson(role),
    });
  }

  Future<void> removeProjectMember({required String projectId, required String userId}) async {
    await _delete('/projects/$projectId/members/$userId');
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

  /// For endpoints whose response body isn't needed by the caller (e.g.
  /// reorder returns the touched siblings, which we discard and refetch
  /// the authoritative list instead).
  Future<void> _patchIgnoreBody(String path, Map<String, dynamic> body) async {
    final res = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    );
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
