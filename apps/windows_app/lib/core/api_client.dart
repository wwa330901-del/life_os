import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'models/admin_models.dart';
import 'models/app_user.dart';
import 'models/document_template.dart';
import 'models/finance.dart';
import 'models/generated_document.dart';
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

  Future<AppUser> updateMe({required String name}) async {
    final body = await _patch('/auth/me', {'name': name});
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

  /// Every document template this space has defined — ingesting a *new*
  /// template isn't done through this client (see 大系統 doc: new templates
  /// are tagged and uploaded by hand), only viewing/managing existing ones.
  Future<List<DocumentTemplate>> listDocumentTemplates(String spaceId) async {
    final body = await _getList('/admin/spaces/$spaceId/document-templates');
    return body.map((e) => DocumentTemplate.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> updateDocumentTemplate({
    required String spaceId,
    required String templateId,
    List<String>? allowedTypeOptionIds,
  }) async {
    await _patchIgnoreBody('/admin/spaces/$spaceId/document-templates/$templateId', {
      if (allowedTypeOptionIds != null) 'allowedTypeOptionIds': allowedTypeOptionIds,
    });
  }

  Future<void> deleteDocumentTemplate({required String spaceId, required String templateId}) async {
    await _delete('/admin/spaces/$spaceId/document-templates/$templateId');
  }

  Future<List<DocumentTemplate>> listProjectDocumentTemplates(String projectId) async {
    final body = await _getList('/projects/$projectId/document-templates');
    return body.map((e) => DocumentTemplate.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Fills the template and persists the result — returns the new
  /// [GeneratedDocument]'s metadata, not the rendered bytes themselves
  /// (fetch those separately via [downloadGeneratedDocument] when the user
  /// actually wants to save/print, see [listGeneratedDocuments]).
  Future<GeneratedDocument> fillDocumentTemplate({
    required String projectId,
    required String templateId,
    required Map<String, String> values,
    String? name,
  }) async {
    final body = await _post('/projects/$projectId/document-templates/$templateId/fill', {
      'values': values,
      if (name != null) 'name': name,
    });
    return GeneratedDocument.fromJson(body);
  }

  Future<List<GeneratedDocument>> listGeneratedDocuments(String projectId) async {
    final body = await _getList('/projects/$projectId/documents');
    return body.map((e) => GeneratedDocument.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> deleteGeneratedDocument({
    required String projectId,
    required String documentId,
  }) async {
    await _delete('/projects/$projectId/documents/$documentId');
  }

  /// Returns the rendered `.docx` bytes for an already-generated document.
  Future<Uint8List> downloadGeneratedDocument({
    required String projectId,
    required String documentId,
  }) async {
    final res = await http.get(
      Uri.parse('$baseUrl/projects/$projectId/documents/$documentId/download'),
      headers: _headers,
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final decoded = res.body.isEmpty ? null : jsonDecode(res.body);
      final message = (decoded is Map && decoded['message'] != null)
          ? decoded['message'].toString()
          : 'Request failed (${res.statusCode})';
      throw ApiException(res.statusCode, message);
    }
    return res.bodyBytes;
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
    DateTime? projectEndDate,
    List<PropertyValueInput> propertyValues = const [],
  }) async {
    final body = await _patch('/projects/$projectId', {
      if (name != null) 'name': name,
      if (projectStartDate != null) 'projectStartDate': _dateOnly(projectStartDate),
      if (projectEndDate != null) 'projectEndDate': _dateOnly(projectEndDate),
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
    return _parseEditorState(body);
  }

  ({Project project, List<WorkItem> items, ScheduleResult schedule}) _parseEditorState(
    Map<String, dynamic> body,
  ) {
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

  /// The work-item mutation endpoints below (`create`/`update`/`delete`/
  /// `reorder`) all return the fresh project+items+schedule bundle in the
  /// same response as the write itself — the schedule tab always needs the
  /// recomputed dates right after an edit, and used to make a *second*
  /// full `getProjectEditorState` round trip to get them. Folding that into
  /// one response halves both the network round trips and the repeated
  /// project-access-check queries behind every single edit action.
  Future<({String createdId, Project project, List<WorkItem> items, ScheduleResult schedule})>
  createWorkItem({
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
    final state = _parseEditorState(body);
    return (
      createdId: body['createdId'] as String,
      project: state.project,
      items: state.items,
      schedule: state.schedule,
    );
  }

  /// Every field is "not sent" when omitted (unchanged) vs. explicitly
  /// `null` (cleared) — see UpdateWorkItemDto on the backend. Passing
  /// `clearManualStartDate: true` sends manualStartDate as null.
  Future<({Project project, List<WorkItem> items, ScheduleResult schedule})> updateWorkItem({
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
    return _parseEditorState(body);
  }

  Future<({Project project, List<WorkItem> items, ScheduleResult schedule})> deleteWorkItem({
    required String projectId,
    required String workItemId,
  }) async {
    final body = await _deleteWithBody('/projects/$projectId/work-items/$workItemId');
    return _parseEditorState(body);
  }

  Future<({Project project, List<WorkItem> items, ScheduleResult schedule})> reorderWorkItem({
    required String projectId,
    required String workItemId,
    required String targetId,
    required bool insertAfter,
  }) async {
    final body = await _patch('/projects/$projectId/work-items/$workItemId/reorder', {
      'targetId': targetId,
      'insertAfter': insertAfter,
    });
    return _parseEditorState(body);
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

  // --- Finance (記帳), personal-space only ---

  Future<List<FinanceAccount>> listFinanceAccounts(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/finance/accounts');
    return body.map((e) => FinanceAccount.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createFinanceAccount({
    required String spaceId,
    required String name,
    required FinanceAccountType type,
    double? initialBalance,
  }) async {
    await _post('/spaces/$spaceId/finance/accounts', {
      'name': name,
      'type': type.toJson(),
      if (initialBalance != null) 'initialBalance': initialBalance,
    });
  }

  Future<void> updateFinanceAccount({
    required String spaceId,
    required String accountId,
    String? name,
    FinanceAccountType? type,
    double? initialBalance,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/finance/accounts/$accountId', {
      if (name != null) 'name': name,
      if (type != null) 'type': type.toJson(),
      if (initialBalance != null) 'initialBalance': initialBalance,
    });
  }

  Future<void> deleteFinanceAccount({required String spaceId, required String accountId}) async {
    await _delete('/spaces/$spaceId/finance/accounts/$accountId');
  }

  Future<List<FinanceCategory>> listFinanceCategories(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/finance/categories');
    return body.map((e) => FinanceCategory.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createFinanceCategory({
    required String spaceId,
    required String name,
    required FinanceCategoryKind kind,
  }) async {
    await _post('/spaces/$spaceId/finance/categories', {'name': name, 'kind': kind.toJson()});
  }

  Future<void> updateFinanceCategory({
    required String spaceId,
    required String categoryId,
    required String name,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/finance/categories/$categoryId', {'name': name});
  }

  Future<void> deleteFinanceCategory({required String spaceId, required String categoryId}) async {
    await _delete('/spaces/$spaceId/finance/categories/$categoryId');
  }

  /// `month` is `"YYYY-MM"`; omit to list every transaction, newest first.
  Future<List<FinanceTransaction>> listFinanceTransactions({
    required String spaceId,
    String? month,
  }) async {
    final query = month == null ? '' : '?month=$month';
    final body = await _getList('/spaces/$spaceId/finance/transactions$query');
    return body.map((e) => FinanceTransaction.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<FinanceMonthlySummary> financeMonthlySummary({
    required String spaceId,
    required String month,
  }) async {
    final body = await _get('/spaces/$spaceId/finance/transactions/summary?month=$month');
    return FinanceMonthlySummary.fromJson(body);
  }

  Future<void> createFinanceTransaction({
    required String spaceId,
    required FinanceTransactionType type,
    required double amount,
    required String accountId,
    String? toAccountId,
    String? categoryId,
    required DateTime date,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/finance/transactions', {
      'type': type.toJson(),
      'amount': amount,
      'accountId': accountId,
      if (toAccountId != null) 'toAccountId': toAccountId,
      if (categoryId != null) 'categoryId': categoryId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }

  Future<void> updateFinanceTransaction({
    required String spaceId,
    required String transactionId,
    FinanceTransactionType? type,
    double? amount,
    String? accountId,
    String? toAccountId,
    String? categoryId,
    DateTime? date,
    String? note,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/finance/transactions/$transactionId', {
      if (type != null) 'type': type.toJson(),
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (toAccountId != null) 'toAccountId': toAccountId,
      if (categoryId != null) 'categoryId': categoryId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
    });
  }

  Future<void> deleteFinanceTransaction({
    required String spaceId,
    required String transactionId,
  }) async {
    await _delete('/spaces/$spaceId/finance/transactions/$transactionId');
  }

  Future<List<FinanceBudget>> listFinanceBudgets(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/finance/budgets');
    return body.map((e) => FinanceBudget.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<FinanceBudgetStatus>> financeBudgetStatus({
    required String spaceId,
    required String month,
  }) async {
    final body = await _getList('/spaces/$spaceId/finance/budgets/status?month=$month');
    return body.map((e) => FinanceBudgetStatus.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> upsertFinanceBudget({
    required String spaceId,
    required String categoryId,
    required double monthlyAmount,
  }) async {
    await _post('/spaces/$spaceId/finance/budgets', {
      'categoryId': categoryId,
      'monthlyAmount': monthlyAmount,
    });
  }

  Future<void> deleteFinanceBudget({required String spaceId, required String budgetId}) async {
    await _delete('/spaces/$spaceId/finance/budgets/$budgetId');
  }

  /// Generates (or replaces) a short-lived code the user sends as a LINE
  /// message to the 記帳 bot to link their LINE account to this one.
  Future<({String code, DateTime expiresAt})> generateLineLinkCode() async {
    final body = await _post('/line/link-code', const {});
    return (code: body['code'] as String, expiresAt: DateTime.parse(body['expiresAt'] as String));
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

  Future<Map<String, dynamic>> _deleteWithBody(String path) async {
    final res = await http.delete(Uri.parse('$baseUrl$path'), headers: _headers);
    return _decodeObject(res);
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
