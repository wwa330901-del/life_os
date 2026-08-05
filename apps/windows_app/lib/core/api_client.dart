import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'models/admin_models.dart';
import 'models/ai_usage.dart';
import 'models/ai_assistant.dart';
import 'models/app_user.dart';
import 'models/calendar_event.dart';
import 'models/calendar_share.dart';
import 'models/document_approval.dart';
import 'models/document_template.dart';
import 'models/finance.dart';
import 'models/generated_document.dart';
import 'models/home_dashboard.dart';
import 'models/knowledge.dart';
import 'models/project_todo.dart';
import 'models/project.dart';
import 'models/project_member.dart';
import 'models/project_property.dart';
import 'models/schedule_result.dart';
import 'models/stock.dart';
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

  Future<HomeDashboard> getHomeDashboard() async {
    final body = await _get('/home/dashboard');
    return HomeDashboard.fromJson(body);
  }

  Future<List<HomeWidgetConfig>> getHomeLayout() async {
    final body = await _getList('/home/layout');
    return body.map((e) => HomeWidgetConfig.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<HomeWidgetConfig>> setHomeLayout(List<HomeWidgetConfig> widgets) async {
    final res = await http.put(
      Uri.parse('$baseUrl/home/layout'),
      headers: _headers,
      body: jsonEncode({'widgets': widgets.map((w) => w.toJson()).toList()}),
    );
    final body = _decodeList(res);
    return body.map((e) => HomeWidgetConfig.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SpaceSummary> getOrCreateCalendarSpace() async {
    final body = await _post('/spaces/calendar', {});
    return SpaceSummary.fromJson(body);
  }

  /// Company spaces only, OWNER-only (server-enforced) — cascades every
  /// project/work item/todo/document/approval inside it.
  Future<void> deleteSpace(String spaceId) async {
    await _delete('/spaces/$spaceId');
  }

  Future<List<CalendarEvent>> listCalendarEvents(String spaceId, {DateTime? from, DateTime? to}) async {
    final params = <String, String>{
      if (from != null) 'from': from.toUtc().toIso8601String(),
      if (to != null) 'to': to.toUtc().toIso8601String(),
    };
    final query = params.isEmpty
        ? ''
        : '?${params.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&')}';
    final body = await _getList('/spaces/$spaceId/calendar/events$query');
    return body.map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<CalendarEvent> createCalendarEvent({
    required String spaceId,
    required String title,
    required DateTime startAt,
    DateTime? endAt,
    bool allDay = false,
    String? location,
    String? notes,
  }) async {
    final body = await _post('/spaces/$spaceId/calendar/events', {
      'title': title,
      'startAt': allDay ? _dateOnlyIso(startAt) : startAt.toUtc().toIso8601String(),
      if (endAt != null) 'endAt': allDay ? _dateOnlyIso(endAt) : endAt.toUtc().toIso8601String(),
      'allDay': allDay,
      if (location != null) 'location': location,
      if (notes != null) 'notes': notes,
    });
    return CalendarEvent.fromJson(body);
  }

  Future<CalendarEvent> updateCalendarEvent({
    required String spaceId,
    required String eventId,
    String? title,
    DateTime? startAt,
    DateTime? endAt,
    bool clearEndAt = false,
    bool? allDay,
    String? location,
    bool clearLocation = false,
    String? notes,
    bool clearNotes = false,
  }) async {
    final effectiveAllDay = allDay ?? false;
    final body = await _patch('/spaces/$spaceId/calendar/events/$eventId', {
      if (title != null) 'title': title,
      if (startAt != null) 'startAt': effectiveAllDay ? _dateOnlyIso(startAt) : startAt.toUtc().toIso8601String(),
      if (endAt != null)
        'endAt': effectiveAllDay ? _dateOnlyIso(endAt) : endAt.toUtc().toIso8601String()
      else if (clearEndAt)
        'endAt': null,
      if (allDay != null) 'allDay': allDay,
      if (location != null) 'location': location else if (clearLocation) 'location': null,
      if (notes != null) 'notes': notes else if (clearNotes) 'notes': null,
    });
    return CalendarEvent.fromJson(body);
  }

  Future<void> deleteCalendarEvent({required String spaceId, required String eventId}) async {
    await _delete('/spaces/$spaceId/calendar/events/$eventId');
  }

  Future<GoogleCalendarConnectionStatus> getCalendarConnectionStatus(String spaceId) async {
    final body = await _get('/spaces/$spaceId/calendar/connection');
    return GoogleCalendarConnectionStatus.fromJson(body);
  }

  Future<void> connectGoogleCalendar({
    required String spaceId,
    required String code,
    required String redirectUri,
  }) async {
    await _post('/spaces/$spaceId/calendar/connect', {'code': code, 'redirectUri': redirectUri});
  }

  Future<void> disconnectGoogleCalendar(String spaceId) async {
    await _delete('/spaces/$spaceId/calendar/connect');
  }

  Future<void> syncCalendarNow(String spaceId) async {
    await _post('/spaces/$spaceId/calendar/sync', {});
  }

  Future<CalendarShare> inviteCalendarShare(String email) async {
    final body = await _post('/calendar-shares/invite', {'email': email});
    return CalendarShare.fromJson(body);
  }

  Future<List<CalendarShare>> listCalendarSharesGiven() async {
    final body = await _getList('/calendar-shares/given');
    return body.map((e) => CalendarShare.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<CalendarShare>> listCalendarSharesReceived() async {
    final body = await _getList('/calendar-shares/received');
    return body.map((e) => CalendarShare.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> acceptCalendarShare(String id) async {
    await _post('/calendar-shares/$id/accept', {});
  }

  Future<void> updateCalendarShareDetailLevel({required String id, required CalendarShareDetailLevel detailLevel}) async {
    await _patchIgnoreBody('/calendar-shares/$id/detail-level', {'detailLevel': detailLevel.toJson()});
  }

  Future<void> updateCalendarShareColor({required String id, required String viewerColor}) async {
    await _patchIgnoreBody('/calendar-shares/$id/color', {'viewerColor': viewerColor});
  }

  Future<void> removeCalendarShare(String id) async {
    await _delete('/calendar-shares/$id');
  }

  Future<({List<CalendarEvent> own, List<SharedCalendarEntry> shared})> combinedCalendarEvents({
    required DateTime from,
    required DateTime to,
  }) async {
    final body = await _get(
      '/calendar-shares/combined-events?from=${from.toUtc().toIso8601String()}&to=${to.toUtc().toIso8601String()}',
    );
    final own = (body['own'] as List<dynamic>).map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>)).toList();
    final shared = (body['shared'] as List<dynamic>)
        .map((e) => SharedCalendarEntry.fromJson(e as Map<String, dynamic>))
        .toList();
    return (own: own, shared: shared);
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

  /// Null means this space has no 案名 auto-suggestion rule set.
  Future<NamingTemplate?> getNamingTemplate(String spaceId) async {
    final res = await http.get(
      Uri.parse('$baseUrl/spaces/$spaceId/properties/naming-template'),
      headers: _headers,
    );
    final decoded = _checkStatus(res);
    return decoded == null ? null : NamingTemplate.fromJson(decoded as Map<String, dynamic>);
  }

  Future<void> updateNamingTemplate({
    required String spaceId,
    required List<String> propertyNames,
    required String separator,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/properties/naming-template', {
      'propertyNames': propertyNames,
      'separator': separator,
    });
  }

  Future<void> clearNamingTemplate(String spaceId) async {
    await _delete('/spaces/$spaceId/properties/naming-template');
  }

  Future<void> reorderPropertyDefinition({
    required String spaceId,
    required String definitionId,
    required String targetId,
    required bool insertAfter,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/properties/$definitionId/reorder', {
      'targetId': targetId,
      'insertAfter': insertAfter,
    });
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
    bool? requiresApproval,
  }) async {
    await _patchIgnoreBody('/admin/spaces/$spaceId/document-templates/$templateId', {
      if (allowedTypeOptionIds != null) 'allowedTypeOptionIds': allowedTypeOptionIds,
      if (requiresApproval != null) 'requiresApproval': requiresApproval,
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

  Future<List<DocumentApprovalSummary>> listDocumentApprovals({
    required String projectId,
    required String documentId,
  }) async {
    final body = await _getList('/projects/$projectId/documents/$documentId/approvals');
    return body.map((e) => DocumentApprovalSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> submitDocumentApproval({
    required String projectId,
    required String documentId,
    required List<String> approverUserIds,
  }) async {
    await _post('/projects/$projectId/documents/$documentId/approvals', {
      'approverUserIds': approverUserIds,
    });
  }

  Future<List<PendingApprovalStep>> listPendingApprovals() async {
    final body = await _getList('/document-approvals/pending');
    return body.map((e) => PendingApprovalStep.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<DocumentApprovalsPage> listMyApprovalSubmissions({String? cursor}) async {
    final query = _queryString({'cursor': cursor});
    final body = await _get('/document-approvals/mine$query');
    return DocumentApprovalsPage.fromJson(body);
  }

  Future<void> approveDocumentApprovalStep({required String stepId, String? comment}) async {
    await _post('/document-approvals/steps/$stepId/approve', {
      if (comment != null && comment.isNotEmpty) 'comment': comment,
    });
  }

  Future<void> rejectDocumentApprovalStep({required String stepId, required String comment}) async {
    await _post('/document-approvals/steps/$stepId/reject', {'comment': comment});
  }

  Future<void> requestDocumentApprovalStepInfo({required String stepId, required String text}) async {
    await _post('/document-approvals/steps/$stepId/request-info', {'text': text});
  }

  Future<void> replyDocumentApprovalStepNote({required String stepId, required String text}) async {
    await _post('/document-approvals/steps/$stepId/reply', {'text': text});
  }

  // --- 知識庫 ---

  Future<List<KnowledgeCategory>> listKnowledgeCategories() async {
    final body = await _getList('/knowledge/categories');
    return body.map((e) => KnowledgeCategory.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<KnowledgeCategory>> listPublicKnowledgeCategories() async {
    final body = await _getList('/knowledge/categories/public');
    return body.map((e) => KnowledgeCategory.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<KnowledgeCategory> createKnowledgeCategory({
    required String name,
    required bool isPublic,
    required List<(String name, KnowledgeFieldType type)> fields,
  }) async {
    final body = await _post('/knowledge/categories', {
      'name': name,
      'isPublic': isPublic,
      'fields': fields.map((f) => {'name': f.$1, 'type': f.$2.wireValue}).toList(),
    });
    return KnowledgeCategory.fromJson(body);
  }

  Future<int> seedDefaultKnowledgeCategories() async {
    final body = await _post('/knowledge/categories/seed-defaults', {});
    return body['created'] as int;
  }

  Future<void> updateKnowledgeCategory({required String categoryId, String? name, bool? isPublic}) async {
    await _patch('/knowledge/categories/$categoryId', {
      if (name != null) 'name': name,
      if (isPublic != null) 'isPublic': isPublic,
    });
  }

  Future<void> deleteKnowledgeCategory(String categoryId) async {
    await _delete('/knowledge/categories/$categoryId');
  }

  Future<void> addKnowledgeField({
    required String categoryId,
    required String name,
    required KnowledgeFieldType type,
  }) async {
    await _post('/knowledge/categories/$categoryId/fields', {'name': name, 'type': type.wireValue});
  }

  Future<void> renameKnowledgeField({
    required String categoryId,
    required String fieldId,
    required String name,
  }) async {
    await _patch('/knowledge/categories/$categoryId/fields/$fieldId', {'name': name});
  }

  Future<void> removeKnowledgeField({required String categoryId, required String fieldId}) async {
    await _delete('/knowledge/categories/$categoryId/fields/$fieldId');
  }

  Future<void> addKnowledgeBlacklistEntry({required String categoryId, required String email}) async {
    await _post('/knowledge/categories/$categoryId/blacklist', {'email': email});
  }

  Future<void> removeKnowledgeBlacklistEntry({required String categoryId, required String blockedUserId}) async {
    await _delete('/knowledge/categories/$categoryId/blacklist/$blockedUserId');
  }

  Future<KnowledgeItemsPage> listKnowledgeItems({String? categoryId, String? search, String? cursor}) async {
    final query = _queryString({'categoryId': categoryId, 'search': search, 'cursor': cursor});
    final body = await _get('/knowledge/items$query');
    return KnowledgeItemsPage.fromJson(body);
  }

  Future<KnowledgeItemsPage> listPublicKnowledgeItems({
    String? categoryId,
    String? ownerUserId,
    String? search,
    String? cursor,
  }) async {
    final query = _queryString({
      'categoryId': categoryId,
      'ownerUserId': ownerUserId,
      'search': search,
      'cursor': cursor,
    });
    final body = await _get('/knowledge/items/public$query');
    return KnowledgeItemsPage.fromJson(body);
  }

  Future<KnowledgeItem> getKnowledgeItem(String itemId) async {
    final body = await _get('/knowledge/items/$itemId');
    return KnowledgeItem.fromJson(body);
  }

  Future<void> saveKnowledgeItemCopy(String itemId) async {
    await _post('/knowledge/items/$itemId/save-copy', {});
  }

  Future<void> shareKnowledgeItem(String itemId) async {
    await _post('/knowledge/items/$itemId/share', {});
  }

  Future<void> assignKnowledgeItemCategory(String itemId, String categoryId) async {
    await _patchIgnoreBody('/knowledge/items/$itemId/category', {'categoryId': categoryId});
  }

  Future<void> deleteKnowledgeItem(String itemId) async {
    await _delete('/knowledge/items/$itemId');
  }

  Future<bool> hasGeminiApiKey() async {
    final body = await _get('/users/me/gemini-key');
    return body['hasKey'] as bool;
  }

  Future<void> setGeminiApiKey(String apiKey) async {
    await _patch('/users/me/gemini-key', {'apiKey': apiKey});
  }

  Future<void> clearGeminiApiKey() async {
    await _delete('/users/me/gemini-key');
  }

  Future<AiUsageHistory> getAiUsageHistory() async {
    final body = await _get('/knowledge/ai-usage');
    return AiUsageHistory.fromJson(body);
  }

  /// [previousInteractionId] carries multi-turn continuity — pass back
  /// whatever the previous call returned to continue the same
  /// conversation, or omit to start a fresh one. This is purely
  /// client-held state; the server never persists a conversation itself.
  Future<AiAssistantAnswer> askAiAssistant({
    required String question,
    String? previousInteractionId,
  }) async {
    final body = await _post('/ai-assistant/ask', {
      'question': question,
      if (previousInteractionId != null) 'previousInteractionId': previousInteractionId,
    });
    return AiAssistantAnswer.fromJson(body);
  }

  String _queryString(Map<String, String?> params) {
    final entries = params.entries.where((e) => e.value != null && e.value!.isNotEmpty);
    if (entries.isEmpty) return '';
    return '?${entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value!)}').join('&')}';
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
    DateTime? actualStartDate,
    bool clearActualStartDate = false,
    int? actualDurationDays,
    bool clearActualDurationDays = false,
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
      if (clearActualStartDate)
        'actualStartDate': null
      else if (actualStartDate != null)
        'actualStartDate': _dateOnly(actualStartDate),
      if (clearActualDurationDays)
        'actualDurationDays': null
      else if (actualDurationDays != null)
        'actualDurationDays': actualDurationDays,
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
    String? parentId,
  }) async {
    await _post('/spaces/$spaceId/finance/categories', {
      'name': name,
      'kind': kind.toJson(),
      if (parentId != null) 'parentId': parentId,
    });
  }

  Future<void> updateFinanceCategory({
    required String spaceId,
    required String categoryId,
    String? name,
    String? parentId,
    bool clearParentId = false,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/finance/categories/$categoryId', {
      if (name != null) 'name': name,
      if (clearParentId)
        'parentId': null
      else if (parentId != null)
        'parentId': parentId,
    });
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

  Future<List<FinanceMonthlyTrendPoint>> financeMonthlyTrend({
    required String spaceId,
    int months = 6,
  }) async {
    final body = await _getList('/spaces/$spaceId/finance/transactions/trend?months=$months');
    return body.map((e) => FinanceMonthlyTrendPoint.fromJson(e as Map<String, dynamic>)).toList();
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

  Future<List<FinanceRecurringTransaction>> listFinanceRecurringTransactions(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/finance/recurring-transactions');
    return body.map((e) => FinanceRecurringTransaction.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createFinanceRecurringTransaction({
    required String spaceId,
    required FinanceTransactionType type,
    double? amount,
    required String accountId,
    String? toAccountId,
    String? categoryId,
    required int dayOfMonth,
    FinanceRecurringHolidayAdjustment holidayAdjustment = FinanceRecurringHolidayAdjustment.none,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/finance/recurring-transactions', {
      'type': type.toJson(),
      if (amount != null) 'amount': amount,
      'accountId': accountId,
      if (toAccountId != null) 'toAccountId': toAccountId,
      if (categoryId != null) 'categoryId': categoryId,
      'dayOfMonth': dayOfMonth,
      'holidayAdjustment': holidayAdjustment.toJson(),
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }

  /// [clearAmount] explicitly resets a fixed recurring amount back to
  /// "variable" (reminder-only) — omitting [amount] on its own just means
  /// "leave whatever it currently is alone".
  Future<void> updateFinanceRecurringTransaction({
    required String spaceId,
    required String id,
    FinanceTransactionType? type,
    double? amount,
    bool clearAmount = false,
    String? accountId,
    String? toAccountId,
    String? categoryId,
    int? dayOfMonth,
    FinanceRecurringHolidayAdjustment? holidayAdjustment,
    String? note,
    bool? active,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/finance/recurring-transactions/$id', {
      if (type != null) 'type': type.toJson(),
      if (clearAmount)
        'amount': null
      else if (amount != null)
        'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (toAccountId != null) 'toAccountId': toAccountId,
      if (categoryId != null) 'categoryId': categoryId,
      if (dayOfMonth != null) 'dayOfMonth': dayOfMonth,
      if (holidayAdjustment != null) 'holidayAdjustment': holidayAdjustment.toJson(),
      if (note != null) 'note': note,
      if (active != null) 'active': active,
    });
  }

  Future<void> deleteFinanceRecurringTransaction({required String spaceId, required String id}) async {
    await _delete('/spaces/$spaceId/finance/recurring-transactions/$id');
  }

  Future<List<FinanceLoan>> listFinanceLoans(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/finance/loans');
    return body.map((e) => FinanceLoan.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createFinanceLoan({
    required String spaceId,
    required FinanceLoanDirection direction,
    required String counterpartyName,
    required double amount,
    required String accountId,
    required DateTime date,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/finance/loans', {
      'direction': direction.toJson(),
      'counterpartyName': counterpartyName,
      'amount': amount,
      'accountId': accountId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }

  Future<void> addFinanceLoanRepayment({
    required String spaceId,
    required String loanId,
    required double amount,
    required String accountId,
    required DateTime date,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/finance/loans/$loanId/repayments', {
      'amount': amount,
      'accountId': accountId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }

  Future<void> updateFinanceLoan({
    required String spaceId,
    required String id,
    String? counterpartyName,
    double? amount,
    String? accountId,
    DateTime? date,
    String? note,
  }) async {
    await _patch('/spaces/$spaceId/finance/loans/$id', {
      if (counterpartyName != null) 'counterpartyName': counterpartyName,
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
    });
  }

  Future<void> updateFinanceLoanRepayment({
    required String spaceId,
    required String loanId,
    required String repaymentId,
    double? amount,
    String? accountId,
    DateTime? date,
    String? note,
  }) async {
    await _patch('/spaces/$spaceId/finance/loans/$loanId/repayments/$repaymentId', {
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
    });
  }

  Future<void> deleteFinanceLoan({required String spaceId, required String id}) async {
    await _delete('/spaces/$spaceId/finance/loans/$id');
  }

  Future<void> inviteFinanceLoanConfirmation({required String spaceId, required String id, required String email}) async {
    await _post('/spaces/$spaceId/finance/loans/$id/invite', {'email': email});
  }

  Future<List<FinanceLoanInvite>> listReceivedFinanceLoanInvites() async {
    final body = await _getList('/finance-loan-invites/received');
    return body.map((e) => FinanceLoanInvite.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> acceptFinanceLoanInvite(String id) async {
    await _post('/finance-loan-invites/$id/accept', {});
  }

  Future<void> removeFinanceLoanInvite(String id) async {
    await _delete('/finance-loan-invites/$id');
  }

  Future<List<FinanceAdvance>> listFinanceAdvances(String spaceId, {String? projectId}) async {
    final body = await _getList(
      '/spaces/$spaceId/finance/advances${_queryString({'projectId': projectId})}',
    );
    return body.map((e) => FinanceAdvance.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createFinanceAdvance({
    required String spaceId,
    required String title,
    required double amount,
    required String accountId,
    required DateTime date,
    String? note,
    String? projectId,
  }) async {
    await _post('/spaces/$spaceId/finance/advances', {
      'title': title,
      'amount': amount,
      'accountId': accountId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
      if (projectId != null) 'projectId': projectId,
    });
  }

  Future<void> addFinanceAdvanceRepayment({
    required String spaceId,
    required String advanceId,
    required double amount,
    required String accountId,
    required DateTime date,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/finance/advances/$advanceId/repayments', {
      'amount': amount,
      'accountId': accountId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }

  Future<void> updateFinanceAdvance({
    required String spaceId,
    required String id,
    String? title,
    double? amount,
    String? accountId,
    DateTime? date,
    String? note,
    String? projectId,
    bool clearProjectId = false,
  }) async {
    await _patch('/spaces/$spaceId/finance/advances/$id', {
      if (title != null) 'title': title,
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
      if (projectId != null) 'projectId': projectId,
      if (clearProjectId) 'clearProjectId': true,
    });
  }

  Future<void> updateFinanceAdvanceRepayment({
    required String spaceId,
    required String advanceId,
    required String repaymentId,
    double? amount,
    String? accountId,
    DateTime? date,
    String? note,
  }) async {
    await _patch('/spaces/$spaceId/finance/advances/$advanceId/repayments/$repaymentId', {
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
    });
  }

  Future<void> deleteFinanceAdvance({required String spaceId, required String id}) async {
    await _delete('/spaces/$spaceId/finance/advances/$id');
  }

  Future<List<MyProjectSummary>> listMyProjects() async {
    final body = await _getList('/projects/mine');
    return body.map((e) => MyProjectSummary.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<StockHolding>> listStockHoldings(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/stocks/holdings');
    return body.map((e) => StockHolding.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<StockTransactionsPage> listStockTransactions(String spaceId, {String? cursor}) async {
    final query = _queryString({'cursor': cursor});
    final body = await _get('/spaces/$spaceId/stocks/transactions$query');
    return StockTransactionsPage.fromJson(body);
  }

  Future<void> createStockTransaction({
    required String spaceId,
    required String stockCode,
    required StockTransactionType type,
    required double pricePerShare,
    required double totalCost,
    required DateTime tradeDate,
    required String accountId,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/stocks/transactions', {
      'stockCode': stockCode,
      'type': type.toJson(),
      'pricePerShare': pricePerShare,
      'totalCost': totalCost,
      'tradeDate': _dateOnlyIso(tradeDate),
      'accountId': accountId,
      if (note != null && note.isNotEmpty) 'note': note,
    });
  }

  Future<void> updateStockTransaction({
    required String spaceId,
    required String id,
    String? stockCode,
    double? pricePerShare,
    double? totalCost,
    DateTime? tradeDate,
    String? accountId,
    String? note,
  }) async {
    await _patch('/spaces/$spaceId/stocks/transactions/$id', {
      if (stockCode != null) 'stockCode': stockCode,
      if (pricePerShare != null) 'pricePerShare': pricePerShare,
      if (totalCost != null) 'totalCost': totalCost,
      if (tradeDate != null) 'tradeDate': _dateOnlyIso(tradeDate),
      if (accountId != null) 'accountId': accountId,
      if (note != null) 'note': note,
    });
  }

  Future<void> deleteStockTransaction({required String spaceId, required String id}) async {
    await _delete('/spaces/$spaceId/stocks/transactions/$id');
  }

  Future<List<StockRecurringInvestment>> listStockRecurringInvestments(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/stocks/recurring');
    return body.map((e) => StockRecurringInvestment.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createStockRecurringInvestment({
    required String spaceId,
    required String stockCode,
    required int dayOfMonth,
    FinanceRecurringHolidayAdjustment holidayAdjustment = FinanceRecurringHolidayAdjustment.none,
    required String accountId,
  }) async {
    await _post('/spaces/$spaceId/stocks/recurring', {
      'stockCode': stockCode,
      'dayOfMonth': dayOfMonth,
      'holidayAdjustment': holidayAdjustment.toJson(),
      'accountId': accountId,
    });
  }

  Future<void> updateStockRecurringInvestment({
    required String spaceId,
    required String id,
    String? stockCode,
    int? dayOfMonth,
    FinanceRecurringHolidayAdjustment? holidayAdjustment,
    String? accountId,
    bool? active,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/stocks/recurring/$id', {
      if (stockCode != null) 'stockCode': stockCode,
      if (dayOfMonth != null) 'dayOfMonth': dayOfMonth,
      if (holidayAdjustment != null) 'holidayAdjustment': holidayAdjustment.toJson(),
      if (accountId != null) 'accountId': accountId,
      if (active != null) 'active': active,
    });
  }

  Future<void> deleteStockRecurringInvestment({required String spaceId, required String id}) async {
    await _delete('/spaces/$spaceId/stocks/recurring/$id');
  }

  /// 代辦事項 is its own top-level space now (not nested under a project) —
  /// this returns 個人 + 工作（每個專案分組）合併的畫面資料一次拿齊。
  Future<TodoOverview> listAllTodos() async {
    final body = await _get('/todos');
    return TodoOverview.fromJson(body);
  }

  /// 已完成代辦事項歷史——個人+工作合併、依完成時間新到舊分頁（10 筆一頁）。
  Future<CompletedTodosPage> listCompletedTodos({String? search, String? cursor}) async {
    final query = _queryString({'search': search, 'cursor': cursor});
    final body = await _get('/todos/completed$query');
    return CompletedTodosPage.fromJson(body);
  }

  /// projectId 留空 = 個人事項（歸屬呼叫者本人）；有填 = 工作事項（歸屬該專
  /// 案，呼叫者需有該專案的存取權）。dueDate/isOngoing 必須恰好擇一（後端
  /// 會驗證）——傳 isOngoing: true 時就不用帶 dueDate。
  Future<void> createTodo({
    String? projectId,
    required String title,
    DateTime? dueDate,
    bool dueDateAllDay = true,
    bool isOngoing = false,
    TodoPriority? priority,
    String? notes,
    String? assigneeUserId,
  }) async {
    await _post('/todos', {
      if (projectId != null) 'projectId': projectId,
      'title': title,
      if (dueDate != null)
        'dueDate': dueDateAllDay ? _dateOnly(dueDate) : dueDate.toUtc().toIso8601String(),
      'dueDateAllDay': dueDateAllDay,
      'isOngoing': isOngoing,
      if (priority != null) 'priority': priority.toJson(),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (assigneeUserId != null) 'assigneeUserId': assigneeUserId,
    });
  }

  Future<void> updateTodo({
    required String todoId,
    String? title,
    bool? done,
    DateTime? dueDate,
    bool dueDateAllDay = true,
    bool clearDueDate = false,
    bool? isOngoing,
    TodoPriority? priority,
    String? notes,
    bool clearNotes = false,
    String? assigneeUserId,
    bool clearAssignee = false,
  }) async {
    await _patchIgnoreBody('/todos/$todoId', {
      if (title != null) 'title': title,
      if (done != null) 'done': done,
      if (clearDueDate)
        'dueDate': null
      else if (dueDate != null)
        'dueDate': dueDateAllDay ? _dateOnly(dueDate) : dueDate.toUtc().toIso8601String(),
      if (dueDate != null || clearDueDate) 'dueDateAllDay': dueDateAllDay,
      if (isOngoing != null) 'isOngoing': isOngoing,
      if (priority != null) 'priority': priority.toJson(),
      if (clearNotes)
        'notes': null
      else if (notes != null)
        'notes': notes,
      if (clearAssignee)
        'assigneeUserId': null
      else if (assigneeUserId != null)
        'assigneeUserId': assigneeUserId,
    });
  }

  Future<void> deleteTodo(String todoId) async {
    await _delete('/todos/$todoId');
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

  /// For an all-day event's date, `d`'s local Y/M/D is the calendar date
  /// the user actually picked — encode it as that same Y/M/D at UTC
  /// midnight (never `.toUtc()`, which would shift the instant by the
  /// local UTC offset and can push the date a day either direction, e.g.
  /// UTC+8 local midnight Aug 1 becoming July 31 16:00 UTC).
  String _dateOnlyIso(DateTime d) => DateTime.utc(d.year, d.month, d.day).toIso8601String();

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
