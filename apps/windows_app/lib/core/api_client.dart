import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models/admin_models.dart';
import 'models/ai_usage.dart';
import 'models/ai_assistant.dart';
import 'models/app_user.dart';
import 'models/calendar_event.dart';
import 'models/calendar_share.dart';
import 'models/friend.dart';
import 'models/finance_report.dart';
import 'models/finance.dart';
import 'models/divination.dart';
import 'models/home_dashboard.dart';
import 'models/journal_entry.dart';
import 'models/knowledge.dart';
import 'models/life_goal.dart';
import 'models/finance_plan.dart';
import 'models/memory.dart';
import 'models/wishlist.dart';
import 'models/retirement.dart';
import 'models/trip.dart';
import 'models/project_todo.dart';
import 'models/stock.dart';

/// 跟後端 SYSTEM_TROUBLE_MESSAGE 同一句。
const systemTroubleMessage = '系統出了點問題，已經通知管理員，正在修理中，請稍後再試 🙏';

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

  /// 開 App／登入時回報：後端用連線 IP 估城市（問天氣沒講地點用）。
  /// 不等結果、失敗也不影響使用。
  void reportLocation() {
    unawaited(_post('/auth/me/location', const {}).then<void>((_) {}, onError: (_) {}));
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
    CalendarRecurrenceFrequency recurrenceFrequency = CalendarRecurrenceFrequency.none,
    DateTime? recurrenceUntil,
    CalendarSyncTarget? syncTarget,
  }) async {
    final body = await _post('/spaces/$spaceId/calendar/events', {
      if (syncTarget != null) 'syncTarget': syncTarget.toJson(),
      'title': title,
      'startAt': allDay ? _dateOnlyIso(startAt) : startAt.toUtc().toIso8601String(),
      if (endAt != null) 'endAt': allDay ? _dateOnlyIso(endAt) : endAt.toUtc().toIso8601String(),
      'allDay': allDay,
      if (location != null) 'location': location,
      if (notes != null) 'notes': notes,
      if (recurrenceFrequency != CalendarRecurrenceFrequency.none)
        'recurrenceFrequency': recurrenceFrequency.toJson(),
      if (recurrenceUntil != null) 'recurrenceUntil': _dateOnly(recurrenceUntil),
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
    CalendarRecurrenceFrequency? recurrenceFrequency,
    DateTime? recurrenceUntil,
    bool clearRecurrenceUntil = false,
    CalendarSyncTarget? syncTarget,
  }) async {
    final effectiveAllDay = allDay ?? false;
    final body = await _patch('/spaces/$spaceId/calendar/events/$eventId', {
      if (syncTarget != null) 'syncTarget': syncTarget.toJson(),
      if (title != null) 'title': title,
      if (startAt != null) 'startAt': effectiveAllDay ? _dateOnlyIso(startAt) : startAt.toUtc().toIso8601String(),
      if (endAt != null)
        'endAt': effectiveAllDay ? _dateOnlyIso(endAt) : endAt.toUtc().toIso8601String()
      else if (clearEndAt)
        'endAt': null,
      if (allDay != null) 'allDay': allDay,
      if (location != null) 'location': location else if (clearLocation) 'location': null,
      if (notes != null) 'notes': notes else if (clearNotes) 'notes': null,
      if (recurrenceFrequency != null) 'recurrenceFrequency': recurrenceFrequency.toJson(),
      if (recurrenceUntil != null)
        'recurrenceUntil': _dateOnly(recurrenceUntil)
      else if (clearRecurrenceUntil)
        'recurrenceUntil': null,
    });
    return CalendarEvent.fromJson(body);
  }

  Future<void> deleteCalendarEvent({required String spaceId, required String eventId}) async {
    await _delete('/spaces/$spaceId/calendar/events/$eventId');
  }

  /// 循環事件單一發生的 只改這次／這次以後／全部 編輯——`seriesId` 是循環
  /// 事件本體的 id（不是這次發生自己的 id，大部分發生根本沒有自己的
  /// row，見後端 `CalendarEventsService.list` 的說明），`occurrenceDate`
  /// 是這次發生的日期（"YYYY-MM-DD"）。
  Future<void> updateCalendarEventOccurrence({
    required String spaceId,
    required String seriesId,
    required String occurrenceDate,
    required CalendarOccurrenceScope scope,
    String? title,
    DateTime? startAt,
    DateTime? endAt,
    bool clearEndAt = false,
    bool? allDay,
    String? location,
    bool clearLocation = false,
    String? notes,
    bool clearNotes = false,
    CalendarRecurrenceFrequency? recurrenceFrequency,
    DateTime? recurrenceUntil,
    bool clearRecurrenceUntil = false,
  }) async {
    final effectiveAllDay = allDay ?? false;
    await _patch('/spaces/$spaceId/calendar/events/$seriesId/occurrence', {
      'occurrenceDate': occurrenceDate,
      'scope': scope.toJson(),
      if (title != null) 'title': title,
      if (startAt != null) 'startAt': effectiveAllDay ? _dateOnlyIso(startAt) : startAt.toUtc().toIso8601String(),
      if (endAt != null)
        'endAt': effectiveAllDay ? _dateOnlyIso(endAt) : endAt.toUtc().toIso8601String()
      else if (clearEndAt)
        'endAt': null,
      if (allDay != null) 'allDay': allDay,
      if (location != null) 'location': location else if (clearLocation) 'location': null,
      if (notes != null) 'notes': notes else if (clearNotes) 'notes': null,
      if (recurrenceFrequency != null) 'recurrenceFrequency': recurrenceFrequency.toJson(),
      if (recurrenceUntil != null)
        'recurrenceUntil': _dateOnly(recurrenceUntil)
      else if (clearRecurrenceUntil)
        'recurrenceUntil': null,
    });
  }

  Future<void> deleteCalendarEventOccurrence({
    required String spaceId,
    required String seriesId,
    required String occurrenceDate,
    required CalendarOccurrenceScope scope,
  }) async {
    await _delete(
      '/spaces/$spaceId/calendar/events/$seriesId/occurrence'
      '?occurrenceDate=${Uri.encodeComponent(occurrenceDate)}&scope=${scope.toJson()}',
    );
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

  Future<AppleCalendarConnectionStatus> getAppleCalendarConnectionStatus(String spaceId) async {
    final body = await _get('/spaces/$spaceId/calendar/apple/connection');
    return AppleCalendarConnectionStatus.fromJson(body);
  }

  /// 第一步——只驗證帳密、列出這個 Apple ID 能看到的所有日曆，不會存進
  /// 資料庫，接下來使用者要在這份清單裡勾選。
  Future<List<AppleCalendarSummary>> discoverAppleCalendars({
    required String spaceId,
    required String appleId,
    required String appPassword,
  }) async {
    final body = await _post('/spaces/$spaceId/calendar/apple/discover', {
      'appleId': appleId,
      'appPassword': appPassword,
    });
    return (body['calendars'] as List<dynamic>)
        .map((e) => AppleCalendarSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> connectAppleCalendar({
    required String spaceId,
    required String appleId,
    required String appPassword,
    required List<String> selectedCalendarUrls,
    String? writeCalendarUrl,
  }) async {
    await _post('/spaces/$spaceId/calendar/apple/connect', {
      'appleId': appleId,
      'appPassword': appPassword,
      'selectedCalendarUrls': selectedCalendarUrls,
      if (writeCalendarUrl != null) 'writeCalendarUrl': writeCalendarUrl,
    });
  }

  /// 已連結後列出同步中的日曆（含名稱、哪一個是寫入用的）——用伺服器存著
  /// 的 App 專用密碼查，不用重新輸入。
  Future<List<AppleSyncedCalendar>> listAppleSyncedCalendars(String spaceId) async {
    final body = await _get('/spaces/$spaceId/calendar/apple/calendars');
    return (body['calendars'] as List<dynamic>)
        .map((e) => AppleSyncedCalendar.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> setAppleWriteCalendar({required String spaceId, required String writeCalendarUrl}) async {
    await _patch('/spaces/$spaceId/calendar/apple/write-calendar', {'writeCalendarUrl': writeCalendarUrl});
  }

  Future<void> disconnectAppleCalendar(String spaceId) async {
    await _delete('/spaces/$spaceId/calendar/apple/connect');
  }

  Future<void> syncAppleCalendarNow(String spaceId) async {
    await _post('/spaces/$spaceId/calendar/apple/sync', {});
  }

  /// 2026-08-06 起邀請對象必須先是好友——傳對方的 userId（從好友列表選）。
  Future<CalendarShare> inviteCalendarShare(String viewerUserId) async {
    final body = await _post('/calendar-shares/invite', {'viewerUserId': viewerUserId});
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

  Future<List<FriendUser>> listFriends() async {
    final body = await _getList('/friends');
    return body.map((e) => FriendUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<FriendInvite>> listReceivedFriendInvites() async {
    final body = await _getList('/friends/received');
    return body.map((e) => FriendInvite.fromReceivedJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<FriendInvite>> listSentFriendInvites() async {
    final body = await _getList('/friends/sent');
    return body.map((e) => FriendInvite.fromSentJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> inviteFriend(String email) async {
    await _post('/friends/invite', {'email': email});
  }

  Future<void> acceptFriendInvite(String id) async {
    await _post('/friends/$id/accept', {});
  }

  Future<void> removeFriend(String id) async {
    await _delete('/friends/$id');
  }

  Future<List<AdminUserSummary>> adminListUsers() async {
    final body = await _getList('/admin/users');
    return body
        .map((e) => AdminUserSummary.fromJson(e as Map<String, dynamic>))
        .toList();
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

  /// 重新分析 (2026-08-06) — 等分析真的跑完才回應（不是 fire-and-forget），
  /// 呼叫端可以直接顯示 loading 直到這個 Future 完成。
  Future<void> reanalyzeKnowledgeItem(String itemId, {String? instruction}) async {
    await _post('/knowledge/items/$itemId/reanalyze', {
      if (instruction != null && instruction.isNotEmpty) 'instruction': instruction,
    });
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

  Future<bool> hasClaudeApiKey() async {
    final body = await _get('/users/me/claude-key');
    return body['hasKey'] as bool;
  }

  Future<void> setClaudeApiKey(String apiKey) async {
    await _patch('/users/me/claude-key', {'apiKey': apiKey});
  }

  Future<void> clearClaudeApiKey() async {
    await _delete('/users/me/claude-key');
  }

  Future<AiUsageHistory> getAiUsageHistory() async {
    final body = await _get('/knowledge/ai-usage');
    return AiUsageHistory.fromJson(body);
  }

  /// 管理員：所有使用者的 AI 用量。
  Future<AdminAiUsage> getAdminAiUsage() async {
    final body = await _get('/admin/ai-usage');
    return AdminAiUsage.fromJson(body);
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

  // --- Finance (記帳), personal-space only ---

  Future<List<FinanceAccount>> listFinanceAccounts(String spaceId) async {
    final body = await _getList('/spaces/$spaceId/finance/accounts');
    return body.map((e) => FinanceAccount.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Returns the new account's id.
  Future<String> createFinanceAccount({
    required String spaceId,
    required String name,
    required FinanceAccountType type,
    double? initialBalance,
  }) async {
    final body = await _post('/spaces/$spaceId/finance/accounts', {
      'name': name,
      'type': type.toJson(),
      if (initialBalance != null) 'initialBalance': initialBalance,
    });
    return body['id'] as String;
  }

  /// [card] 有給就一起存信用卡設定（值是 null 代表清掉）。
  Future<void> updateFinanceAccount({
    required String spaceId,
    required String accountId,
    String? name,
    FinanceAccountType? type,
    double? initialBalance,
    CreditCardSettings? card,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/finance/accounts/$accountId', {
      if (name != null) 'name': name,
      if (type != null) 'type': type.toJson(),
      if (initialBalance != null) 'initialBalance': initialBalance,
      if (card != null) ...{
        'statementDay': card.statementDay,
        'paymentDueDay': card.paymentDueDay,
        'paymentAccountId': card.paymentAccountId,
        'cardAutoPay': card.autoPay,
      },
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

  Future<FinanceReport> financeReport(String spaceId) async {
    final body = await _get('/spaces/$spaceId/finance/report');
    return FinanceReport.fromJson(body);
  }

  Future<FinanceHealth> financeHealth(String spaceId) async {
    final body = await _get('/spaces/$spaceId/finance/report/health');
    return FinanceHealth.fromJson(body);
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

  Future<FinanceLoansPage> listFinanceLoans(
    String spaceId, {
    String? cursor,
    bool? settled,
    DateTime? from,
    DateTime? to,
  }) async {
    final query = _queryString({
      'cursor': cursor,
      'settled': settled?.toString(),
      'from': from != null ? _dateOnly(from) : null,
      'to': to != null ? _dateOnly(to) : null,
    });
    final body = await _get('/spaces/$spaceId/finance/loans$query');
    return FinanceLoansPage.fromJson(body);
  }

  Future<void> createFinanceLoan({
    required String spaceId,
    required FinanceLoanDirection direction,
    required String counterpartyName,
    required double amount,
    required String accountId,
    required DateTime date,
    String? note,
    DateTime? dueDate,
  }) async {
    await _post('/spaces/$spaceId/finance/loans', {
      'direction': direction.toJson(),
      'counterpartyName': counterpartyName,
      'amount': amount,
      'accountId': accountId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
      if (dueDate != null) 'dueDate': _dateOnly(dueDate),
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
    bool setDueDate = false,
    DateTime? dueDate,
  }) async {
    await _patch('/spaces/$spaceId/finance/loans/$id', {
      if (counterpartyName != null) 'counterpartyName': counterpartyName,
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
      // [setDueDate] 才送：dueDate 是 null 代表清掉約定還款日。
      if (setDueDate) 'dueDate': dueDate == null ? null : _dateOnly(dueDate),
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

  /// 2026-08-06 起邀請對象必須先是好友——傳對方的 userId（從好友列表選）。
  Future<void> inviteFinanceLoanConfirmation({
    required String spaceId,
    required String id,
    required String toUserId,
  }) async {
    await _post('/spaces/$spaceId/finance/loans/$id/invite', {'toUserId': toUserId});
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

  Future<FinanceAdvancesPage> listFinanceAdvances(
    String spaceId, {
    String? cursor,
    bool? settled,
    DateTime? from,
    DateTime? to,
  }) async {
    final query = _queryString({
      'cursor': cursor,
      'settled': settled?.toString(),
      'from': from != null ? _dateOnly(from) : null,
      'to': to != null ? _dateOnly(to) : null,
    });
    final body = await _get('/spaces/$spaceId/finance/advances$query');
    return FinanceAdvancesPage.fromJson(body);
  }

  Future<void> createFinanceAdvance({
    required String spaceId,
    required String title,
    required double amount,
    required String accountId,
    required DateTime date,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/finance/advances', {
      'title': title,
      'amount': amount,
      'accountId': accountId,
      'date': _dateOnly(date),
      if (note != null && note.isNotEmpty) 'note': note,
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
  }) async {
    await _patch('/spaces/$spaceId/finance/advances/$id', {
      if (title != null) 'title': title,
      if (amount != null) 'amount': amount,
      if (accountId != null) 'accountId': accountId,
      if (date != null) 'date': _dateOnly(date),
      if (note != null) 'note': note,
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
    required double shares,
    required DateTime tradeDate,
    required String accountId,
    String? note,
  }) async {
    await _post('/spaces/$spaceId/stocks/transactions', {
      'stockCode': stockCode,
      'type': type.toJson(),
      'pricePerShare': pricePerShare,
      'shares': shares,
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
    double? shares,
    DateTime? tradeDate,
    String? accountId,
    String? note,
  }) async {
    await _patch('/spaces/$spaceId/stocks/transactions/$id', {
      if (stockCode != null) 'stockCode': stockCode,
      if (pricePerShare != null) 'pricePerShare': pricePerShare,
      if (shares != null) 'shares': shares,
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
    required double monthlyAmount,
  }) async {
    await _post('/spaces/$spaceId/stocks/recurring', {
      'stockCode': stockCode,
      'dayOfMonth': dayOfMonth,
      'holidayAdjustment': holidayAdjustment.toJson(),
      'accountId': accountId,
      'monthlyAmount': monthlyAmount,
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
    double? monthlyAmount,
  }) async {
    await _patchIgnoreBody('/spaces/$spaceId/stocks/recurring/$id', {
      if (stockCode != null) 'stockCode': stockCode,
      if (dayOfMonth != null) 'dayOfMonth': dayOfMonth,
      if (holidayAdjustment != null) 'holidayAdjustment': holidayAdjustment.toJson(),
      if (accountId != null) 'accountId': accountId,
      if (active != null) 'active': active,
      if (monthlyAmount != null) 'monthlyAmount': monthlyAmount,
    });
  }

  Future<void> deleteStockRecurringInvestment({required String spaceId, required String id}) async {
    await _delete('/spaces/$spaceId/stocks/recurring/$id');
  }

  /// 登記成交——計畫在等待回覆時（`awaitingReply`），App 端直接補「成交
  /// 價」，跟回 LINE 訊息是同一套後端邏輯，只是不用透過 LINE。股數/金額
  /// 都是後端用計畫的 monthlyAmount 自動算，不用另外傳。
  Future<void> fulfillStockRecurringInvestment({
    required String spaceId,
    required String id,
    required double pricePerShare,
  }) async {
    await _post('/spaces/$spaceId/stocks/recurring/$id/fulfill', {'pricePerShare': pricePerShare});
  }

  /// 立即檢查——不用等隔天早上 9 點排程，剛補上每期金額的計畫可以馬上
  /// 手動觸發一次到期檢查（如果這個月的扣款日已經到了）。
  Future<void> checkStockRecurringInvestmentNow({required String spaceId, required String id}) async {
    await _post('/spaces/$spaceId/stocks/recurring/$id/check-now', {});
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

  /// dueDate/isOngoing 必須恰好擇一（後端會驗證）——傳 isOngoing: true 時
  /// 就不用帶 dueDate。
  Future<void> createTodo({
    required String title,
    DateTime? dueDate,
    bool dueDateAllDay = true,
    bool isOngoing = false,
    TodoPriority? priority,
    String? notes,
    CalendarSyncTarget? calendarSyncTarget,
  }) async {
    await _post('/todos', {
      if (calendarSyncTarget != null) 'calendarSyncTarget': calendarSyncTarget.toJson(),
      'title': title,
      if (dueDate != null)
        'dueDate': dueDateAllDay ? _dateOnly(dueDate) : dueDate.toUtc().toIso8601String(),
      'dueDateAllDay': dueDateAllDay,
      'isOngoing': isOngoing,
      if (priority != null) 'priority': priority.toJson(),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
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
    CalendarSyncTarget? calendarSyncTarget,
  }) async {
    await _patchIgnoreBody('/todos/$todoId', {
      if (calendarSyncTarget != null) 'calendarSyncTarget': calendarSyncTarget.toJson(),
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
    });
  }

  Future<void> deleteTodo(String todoId) async {
    await _delete('/todos/$todoId');
  }

  /// 人生目標 — account-level. Sorted server-side by status then targetDate.
  // --- 算命（梅花易數）---

  Future<BirthProfile> getBirthProfile() async {
    return BirthProfile.fromJson(await _get('/divination/profile'));
  }

  Future<BirthProfile> setBirthProfile({required String birthDate, String? birthTime}) async {
    final body = await _post('/divination/profile', {'birthDate': birthDate, 'birthTime': ?birthTime});
    return BirthProfile.fromJson(body);
  }

  Future<List<DivinationRecord>> listDivinations() async {
    final body = await _getList('/divination');
    return body.map((e) => DivinationRecord.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<DivinationRecord> castDivination(String question) async {
    return DivinationRecord.fromJson(await _post('/divination/cast', {'question': question}));
  }

  /// [accuracy]：3＝準、2＝部分準、1＝不準。
  Future<void> setDivinationFeedback(String id, int accuracy, String? feedback) async {
    await _post('/divination/$id/feedback', {'accuracy': accuracy, 'feedback': ?feedback});
  }

  Future<void> deleteDivination(String id) async {
    await _delete('/divination/$id');
  }

  // --- 理財評估 ---

  /// 產生新的財務規劃（AI，大約 10 秒）。
  Future<FinancePlan> generateFinancePlan(String spaceId) async {
    final body = await _post('/spaces/$spaceId/finance/report/plan', {});
    return FinancePlan.fromJson(body['structured'] as Map<String, dynamic>);
  }

  /// 最近一次的財務規劃；還沒做過是 null。
  Future<FinancePlan?> getLatestFinancePlan(String spaceId) async {
    final body = await _get('/spaces/$spaceId/finance/report/plan');
    final plan = body['plan'];
    return plan == null ? null : FinancePlan.fromJson(plan as Map<String, dynamic>);
  }

  /// 套用最近一次規劃的建議預算；回傳設好的「分類 金額」。
  Future<List<String>> applyFinancePlanBudgets(String spaceId) async {
    final body = await _post('/spaces/$spaceId/finance/report/plan/apply-budgets', {});
    return (body['applied'] as List<dynamic>).cast<String>();
  }

  // --- 日記 ---

  // --- 購物車 ---

  Future<WishlistOverview> getWishlist() async {
    return WishlistOverview.fromJson(await _get('/wishlist'));
  }

  Future<void> saveWishlistItem({
    String? id,
    required String name,
    required double price,
    required int priority,
    String? targetDate,
    String? note,
  }) async {
    final body = {'name': name, 'price': price, 'priority': priority, 'targetDate': targetDate, 'note': note};
    if (id == null) {
      await _post('/wishlist', body);
    } else {
      await _patch('/wishlist/$id', body);
    }
  }

  Future<void> markWishlistBought(String id, {double? actualPrice}) async {
    await _post('/wishlist/$id/bought', {'actualPrice': ?actualPrice});
  }

  Future<void> deleteWishlistItem(String id) async {
    await _delete('/wishlist/$id');
  }

  /// null＝回到預設（平均結餘的 30%）。
  Future<void> setWishlistBudget(double? amount) async {
    await _patch('/wishlist/budget', {'amount': amount});
  }

  // --- 旅行 ---

  Future<List<Trip>> listTrips() async {
    return [for (final t in await _getList('/trips')) Trip.fromJson(t as Map<String, dynamic>)];
  }

  Future<Trip> getTrip(String id) async => Trip.fromJson(await _get('/trips/$id'));

  Future<List<String>> getTripCalendarTargets() async {
    return [for (final t in (await _get('/trips/calendar-targets'))['targets'] as List<dynamic>) t as String];
  }

  /// plan=true：AI 排行程、估預算、列行李（要 10～30 秒）。
  Future<Trip> createTrip({
    required String destination,
    required String startDate,
    required String endDate,
    required int travelers,
    String? style,
    String? notes,
    bool plan = true,
  }) async {
    return Trip.fromJson(
      await _post('/trips', {
        'destination': destination,
        'startDate': startDate,
        'endDate': endDate,
        'travelers': travelers,
        'style': ?style,
        'notes': ?notes,
        'plan': plan,
      }),
    );
  }

  Future<Trip> updateTrip(String id, Map<String, dynamic> patch) async => Trip.fromJson(await _patch('/trips/$id', patch));

  Future<Trip> replanTrip(String id) async => Trip.fromJson(await _post('/trips/$id/replan', {}));

  Future<Trip> setTripPacking(String id, List<PackingItem> items) async {
    return Trip.fromJson(await _patch('/trips/$id/packing', {'items': [for (final p in items) p.toJson()]}));
  }

  Future<Map<String, dynamic>> addTripToCalendar(String id, {String? target}) =>
      _post('/trips/$id/calendar', {'target': ?target});

  Future<Map<String, dynamic>> saveForTrip(String id) => _post('/trips/$id/save', {});

  Future<void> deleteTrip(String id) => _delete('/trips/$id');

  // --- 退休試算 ---

  Future<RetirementReport> getRetirement() async {
    return RetirementReport.fromJson(await _get('/retirement'));
  }

  /// 只送要改的欄位；值給 null＝改回自動（每月花費／每月存／年齡）。
  Future<RetirementReport> updateRetirementSettings(Map<String, num?> patch) async {
    return RetirementReport.fromJson(await _patch('/retirement', patch));
  }

  // --- AI 記得的事／重要日子 ---

  Future<List<UserMemory>> listMemories() async {
    final body = await _getList('/memories');
    return body.map((e) => UserMemory.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addMemory(String content) async {
    await _post('/memories', {'content': content});
  }

  Future<void> updateMemory(String id, String content) async {
    await _patch('/memories/$id', {'content': content});
  }

  Future<void> deleteMemory(String id) async {
    await _delete('/memories/$id');
  }

  Future<List<ImportantDate>> listImportantDates() async {
    final body = await _getList('/important-dates');
    return body.map((e) => ImportantDate.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> saveImportantDate({
    String? id,
    required String title,
    required int month,
    required int day,
    int? year,
    required bool isLunar,
    String? note,
  }) async {
    final body = {'title': title, 'month': month, 'day': day, 'year': year, 'isLunar': isLunar, 'note': note};
    if (id == null) {
      await _post('/important-dates', body);
    } else {
      await _patch('/important-dates/$id', body);
    }
  }

  Future<void> deleteImportantDate(String id) async {
    await _delete('/important-dates/$id');
  }

  Future<List<JournalEntry>> listJournalEntries({String? keyword}) async {
    final query = keyword != null && keyword.isNotEmpty ? '?keyword=${Uri.encodeQueryComponent(keyword)}' : '';
    final body = await _getList('/journal$query');
    return body.map((e) => JournalEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createJournalEntry({
    required String content,
    required DateTime date,
    int? mood,
    List<String> tags = const [],
  }) async {
    await _post('/journal', {
      'content': content,
      'date': journalDateKey(date),
      'mood': ?mood,
      'tags': tags,
    });
  }

  Future<void> updateJournalEntry(
    String id, {
    required String content,
    required DateTime date,
    int? mood,
    List<String> tags = const [],
  }) async {
    await _patch('/journal/$id', {
      'content': content,
      'date': journalDateKey(date),
      'mood': ?mood,
      'tags': tags,
    });
  }

  Future<void> deleteJournalEntry(String id) async {
    await _delete('/journal/$id');
  }

  Future<List<LifeGoal>> listLifeGoals() async {
    final body = await _getList('/life-goals');
    return body.map((e) => LifeGoal.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createLifeGoal(LifeGoalInput input) async {
    await _post('/life-goals', input.toJson());
  }

  /// The editor always submits the whole goal, so nulls in [input] clear
  /// those fields. [status] has its own call — only changed on purpose.
  Future<void> updateLifeGoal({required String id, required LifeGoalInput input}) async {
    await _patchIgnoreBody('/life-goals/$id', input.toJson());
  }

  /// The user's 記帳 accounts, for the 「指定帳戶餘額」 tracking picker.
  Future<List<LifeGoalAccountOption>> lifeGoalTrackingOptions() async {
    final body = await _get('/life-goals/tracking-options');
    return (body['accounts'] as List<dynamic>)
        .map((e) => LifeGoalAccountOption.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<LifeGoalCheckIn>> listLifeGoalCheckIns(String goalId) async {
    final body = await _getList('/life-goals/$goalId/check-ins');
    return body.map((e) => LifeGoalCheckIn.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addLifeGoalCheckIn({required String goalId, String? title, String? note, double? value}) async {
    await _post('/life-goals/$goalId/check-ins', {
      if (title != null) 'title': title,
      if (note != null) 'note': note,
      if (value != null) 'value': value,
    });
  }

  Future<void> deleteLifeGoalCheckIn(String checkInId) async {
    await _delete('/life-goals/check-ins/$checkInId');
  }

  Future<void> updateLifeGoalStatus({required String id, required LifeGoalStatus status}) async {
    await _patchIgnoreBody('/life-goals/$id', {'status': status.toJson()});
  }

  Future<void> updateLifeGoalProgress({required String id, required double currentValue}) async {
    await _patchIgnoreBody('/life-goals/$id', {'currentValue': currentValue});
  }

  /// AI 自動分類 — null when the user has no Gemini key or it failed.
  Future<String?> suggestLifeGoalCategory({required String title, String? category}) async {
    final body = await _post('/life-goals/suggest-category', {
      'title': title,
      if (category != null) 'category': category,
    });
    return body['category'] as String?;
  }

  /// AI 幫我規劃：把想達成的事變成具體目標（欄位可以直接填進表單）。
  Future<Map<String, dynamic>> planLifeGoal({required String title, String? notes}) async {
    return _post('/life-goals/plan', {'title': title, 'notes': ?notes});
  }

  Future<void> deleteLifeGoal(String id) async {
    await _delete('/life-goals/$id');
  }

  /// 錯誤自動通報 — only works when logged in (the endpoint needs the token); failures are the caller's to ignore.
  Future<void> reportClientError(String message, {String? stack, String? appVersion}) async {
    if (_token == null) return;
    await http.post(
      Uri.parse('$baseUrl/client-errors'),
      headers: _headers,
      body: jsonEncode({
        'message': message.length > 2000 ? message.substring(0, 2000) : message,
        if (stack != null) 'stack': stack.length > 4000 ? stack.substring(0, 4000) : stack,
        'appVersion': ?appVersion,
      }),
    );
  }

  /// 匯出全部資料：一個 Excel 檔的內容。
  Future<List<int>> downloadExport() async {
    final res = await http.get(Uri.parse('$baseUrl/export/xlsx'), headers: _headers);
    if (res.statusCode != 200) _decodeObject(res);
    return res.bodyBytes;
  }

  /// 提醒設定 — `{linked, morningBriefEnabled, journalReminderEnabled, todoReminderEnabled, reviewEnabled, goalReminderEnabled}`.
  Future<Map<String, dynamic>> getReminderSettings() => _get('/line/settings');

  Future<Map<String, dynamic>> updateReminderSettings(Map<String, bool> changes) => _patch('/line/settings', changes);

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
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.body.isEmpty ? null : jsonDecode(res.body);
    }
    // 伺服器重啟中會回 HTML，不能直接 jsonDecode。
    dynamic decoded;
    try {
      decoded = res.body.isEmpty ? null : jsonDecode(res.body);
    } on FormatException {
      decoded = null;
    }
    // 500 以上是系統問題：細節後端已經通知管理員，這裡只講「已通知管理員」。
    if (res.statusCode >= 500) throw ApiException(res.statusCode, systemTroubleMessage);
    final message = (decoded is Map && decoded['message'] != null)
        ? decoded['message'].toString()
        : '操作失敗（${res.statusCode}）';
    throw ApiException(res.statusCode, message);
  }
}
