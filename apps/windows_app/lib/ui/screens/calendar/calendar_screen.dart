import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../core/api_client.dart';
import '../../../core/models/app_user.dart';
import '../../../core/models/calendar_event.dart';
import '../../../core/models/calendar_share.dart';
import '../../../core/theme/app_theme.dart';
import '../../../services/auth/google_oauth_service.dart';
import '../../../state/auth_provider.dart';
import '../../../state/calendar_provider.dart';
import '../../../state/calendar_share_provider.dart';
import 'calendar_share_dialog.dart';

/// Month-grid view for a 行事曆空間 — CalendarEvents only (see module doc in
/// 大系統 for why ProjectTodo due dates aren't overlaid here in v1). Google
/// Calendar connect/sync lives in the header; the day-agenda panel on the
/// right handles create/edit/delete.
class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key, required this.space});

  final SpaceSummary space;

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _focusedDay = DateTime.now();
  DateTime _selectedDay = _dateOnly(DateTime.now());
  bool _showShared = false;

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  DateTime get _monthStart => DateTime(_focusedDay.year, _focusedDay.month, 1);
  DateTime get _monthEnd => DateTime(_focusedDay.year, _focusedDay.month + 1, 1);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final key = CalendarMonthKey(widget.space.id, _monthStart);
    final eventsAsync = ref.watch(calendarEventsProvider(key));
    final sharedEntriesAsync = _showShared
        ? ref.watch(combinedCalendarEventsProvider((from: _monthStart, to: _monthEnd)))
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(gradient: AppGradients.homecoming(scheme.brightness)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 28, 28, 20),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(widget.space.name, style: Theme.of(context).textTheme.headlineMedium),
                const Spacer(),
                FilterChip(
                  label: const Text('顯示共用行事曆'),
                  selected: _showShared,
                  onSelected: (v) => setState(() => _showShared = v),
                ),
                const SizedBox(width: 8),
                IconButton(
                  tooltip: '共用行事曆設定',
                  icon: const Icon(Icons.people_outline),
                  onPressed: () => CalendarShareDialog.show(context),
                ),
                const SizedBox(width: 8),
                _GoogleConnectButton(spaceId: widget.space.id),
                const SizedBox(width: 8),
                _AppleConnectButton(spaceId: widget.space.id),
              ],
            ),
          ),
        ),
        Expanded(
          child: eventsAsync.when(
            data: (events) => _CalendarBody(
              events: events,
              sharedEntries: sharedEntriesAsync?.value?.shared ?? const [],
              focusedDay: _focusedDay,
              selectedDay: _selectedDay,
              onPageChanged: (day) => setState(() => _focusedDay = day),
              onDaySelected: (selected, focused) => setState(() {
                _selectedDay = _dateOnly(selected);
                _focusedDay = focused;
              }),
              spaceId: widget.space.id,
              monthKey: key,
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('讀取行事曆失敗：$error')),
          ),
        ),
      ],
    );
  }
}

class _GoogleConnectButton extends ConsumerWidget {
  const _GoogleConnectButton({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(calendarConnectionProvider(spaceId));

    return statusAsync.when(
      data: (status) {
        if (!status.connected) {
          return FilledButton.tonalIcon(
            onPressed: () => _connect(context, ref),
            icon: const Icon(Icons.link, size: 16),
            label: const Text('連結 Google 行事曆'),
          );
        }
        final lastSynced = status.lastSyncedAt;
        final label = lastSynced == null
            ? '已連結'
            : '已連結 · ${lastSynced.hour.toString().padLeft(2, '0')}:${lastSynced.minute.toString().padLeft(2, '0')} 同步';
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            IconButton(
              tooltip: '立即同步',
              icon: const Icon(Icons.sync, size: 18),
              onPressed: () => _syncNow(context, ref),
            ),
            IconButton(
              tooltip: '取消連結',
              icon: const Icon(Icons.link_off, size: 18),
              onPressed: () => _disconnect(context, ref),
            ),
          ],
        );
      },
      loading: () => const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Future<void> _connect(BuildContext context, WidgetRef ref) async {
    try {
      final oauth = await GoogleOAuthService().connectCalendar();
      await ref
          .read(apiClientProvider)
          .connectGoogleCalendar(spaceId: spaceId, code: oauth.code, redirectUri: oauth.redirectUri);
      ref.invalidate(calendarConnectionProvider(spaceId));
      _invalidateAllMonths(ref);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('連結失敗：$e')));
      }
    }
  }

  Future<void> _syncNow(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).syncCalendarNow(spaceId);
      ref.invalidate(calendarConnectionProvider(spaceId));
      _invalidateAllMonths(ref);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _disconnect(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).disconnectGoogleCalendar(spaceId);
      ref.invalidate(calendarConnectionProvider(spaceId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  /// `calendarEventsProvider` is keyed per-month, so a sync (which may
  /// touch any month) has to invalidate broadly rather than one key —
  /// simplest is invalidating the whole family, autoDispose drops the rest.
  void _invalidateAllMonths(WidgetRef ref) => ref.invalidate(calendarEventsProvider);
}

/// iCloud 日曆連結 (2026-08-11) — 單向匯入（iCloud → 元序），跟 Google 的
/// 雙向同步不同，所以沒有「已連結」狀態下的立即同步跟取消連結以外的動作。
/// 連結流程分兩步：先驗證帳密、列出這個 Apple ID 看得到的所有日曆（含別人
/// 分享、已接受的），再讓使用者勾選要匯入哪幾個。
class _AppleConnectButton extends ConsumerWidget {
  const _AppleConnectButton({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statusAsync = ref.watch(appleCalendarConnectionProvider(spaceId));

    return statusAsync.when(
      data: (status) {
        if (!status.connected) {
          return FilledButton.tonalIcon(
            onPressed: () => _connect(context, ref),
            icon: const Icon(Icons.link, size: 16),
            label: const Text('連結 iCloud 日曆'),
          );
        }
        final lastSynced = status.lastSyncedAt;
        final label = lastSynced == null
            ? 'iCloud 已連結'
            : 'iCloud · ${lastSynced.hour.toString().padLeft(2, '0')}:${lastSynced.minute.toString().padLeft(2, '0')} 同步';
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            IconButton(
              tooltip: '立即同步',
              icon: const Icon(Icons.sync, size: 18),
              onPressed: () => _syncNow(context, ref),
            ),
            IconButton(
              tooltip: '取消連結',
              icon: const Icon(Icons.link_off, size: 18),
              onPressed: () => _disconnect(context, ref),
            ),
          ],
        );
      },
      loading: () => const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Future<void> _connect(BuildContext context, WidgetRef ref) async {
    final appleIdController = TextEditingController();
    final appPasswordController = TextEditingController();

    final credentials = await showDialog<(String, String)>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('連結 iCloud 日曆'),
        content: SizedBox(
          width: 360,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: appleIdController,
                decoration: const InputDecoration(labelText: 'Apple ID（電子郵件）'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: appPasswordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'App 專用密碼'),
              ),
              const SizedBox(height: 8),
              const Text(
                '不是你的 Apple ID 登入密碼，要到 appleid.apple.com 另外產生一組「App 專用密碼」。',
                style: TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(
              context,
            ).pop((appleIdController.text.trim(), appPasswordController.text.trim())),
            child: const Text('下一步'),
          ),
        ],
      ),
    );
    if (credentials == null || !context.mounted) return;
    final (appleId, appPassword) = credentials;
    if (appleId.isEmpty || appPassword.isEmpty) return;

    List<AppleCalendarSummary> calendars;
    try {
      calendars = await ref
          .read(apiClientProvider)
          .discoverAppleCalendars(spaceId: spaceId, appleId: appleId, appPassword: appPassword);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      return;
    }
    if (!context.mounted) return;
    if (calendars.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('這個 Apple ID 底下沒有找到任何日曆')));
      return;
    }

    final selected = <String>{};
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('選擇要同步的日曆'),
          content: SizedBox(
            width: 360,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final calendar in calendars)
                  CheckboxListTile(
                    value: selected.contains(calendar.url),
                    title: Text(calendar.displayName),
                    onChanged: (checked) => setState(() {
                      if (checked == true) {
                        selected.add(calendar.url);
                      } else {
                        selected.remove(calendar.url);
                      }
                    }),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(
              onPressed: selected.isEmpty ? null : () => Navigator.of(context).pop(true),
              child: const Text('連結'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .connectAppleCalendar(
            spaceId: spaceId,
            appleId: appleId,
            appPassword: appPassword,
            selectedCalendarUrls: selected.toList(),
          );
      ref.invalidate(appleCalendarConnectionProvider(spaceId));
      _invalidateAllMonths(ref);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _syncNow(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).syncAppleCalendarNow(spaceId);
      ref.invalidate(appleCalendarConnectionProvider(spaceId));
      _invalidateAllMonths(ref);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _disconnect(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(apiClientProvider).disconnectAppleCalendar(spaceId);
      ref.invalidate(appleCalendarConnectionProvider(spaceId));
      _invalidateAllMonths(ref);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _invalidateAllMonths(WidgetRef ref) => ref.invalidate(calendarEventsProvider);
}

class _CalendarBody extends ConsumerWidget {
  const _CalendarBody({
    required this.events,
    required this.sharedEntries,
    required this.focusedDay,
    required this.selectedDay,
    required this.onPageChanged,
    required this.onDaySelected,
    required this.spaceId,
    required this.monthKey,
  });

  final List<CalendarEvent> events;

  /// 共用行事曆疊圖——只在「顯示共用行事曆」開啟時非空，只影響右側的
  /// 單日行程面板（月曆格子本身維持只顯示自己的行程，不然要重寫整個
  /// 月曆格子的渲染邏輯，範圍太大）。
  final List<SharedCalendarEntry> sharedEntries;
  final DateTime focusedDay;
  final DateTime selectedDay;
  final ValueChanged<DateTime> onPageChanged;
  final void Function(DateTime selected, DateTime focused) onDaySelected;
  final String spaceId;
  final CalendarMonthKey monthKey;

  List<CalendarEvent> _eventsOn(DateTime day) {
    return events.where((e) {
      final start = DateTime(e.startAt.year, e.startAt.month, e.startAt.day);
      final end = e.endAt != null
          ? DateTime(e.endAt!.year, e.endAt!.month, e.endAt!.day)
          : start;
      final d = DateTime(day.year, day.month, day.day);
      return !d.isBefore(start) && !d.isAfter(end);
    }).toList()..sort((a, b) => a.startAt.compareTo(b.startAt));
  }

  List<SharedCalendarEntry> _sharedEntriesOn(DateTime day) {
    return sharedEntries.where((e) {
      final start = DateTime(e.startAt.year, e.startAt.month, e.startAt.day);
      final end = e.endAt != null
          ? DateTime(e.endAt!.year, e.endAt!.month, e.endAt!.day)
          : start;
      final d = DateTime(day.year, day.month, day.day);
      return !d.isBefore(start) && !d.isAfter(end);
    }).toList()..sort((a, b) => a.startAt.compareTo(b.startAt));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 7,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 12, 20),
            child: TableCalendar<CalendarEvent>(
              firstDay: DateTime(2000),
              lastDay: DateTime(2100),
              focusedDay: focusedDay,
              rowHeight: 116,
              daysOfWeekHeight: 24,
              selectedDayPredicate: (day) => isSameDay(day, selectedDay),
              onDaySelected: onDaySelected,
              onPageChanged: onPageChanged,
              eventLoader: _eventsOn,
              headerStyle: const HeaderStyle(
                formatButtonVisible: false,
                titleCentered: true,
              ),
              calendarStyle: const CalendarStyle(outsideDaysVisible: true),
              calendarBuilders: CalendarBuilders<CalendarEvent>(
                // 事件標題直接畫在格子裡（見下方 _DayCell），不需要再疊一層
                // 預設的小圓點 marker。
                markerBuilder: (context, day, dayEvents) => const SizedBox.shrink(),
                defaultBuilder: (context, day, focused) => _DayCell(day: day, events: _eventsOn(day)),
                outsideBuilder: (context, day, focused) =>
                    _DayCell(day: day, events: _eventsOn(day), outside: true),
                todayBuilder: (context, day, focused) =>
                    _DayCell(day: day, events: _eventsOn(day), today: true),
                selectedBuilder: (context, day, focused) => _DayCell(
                  day: day,
                  events: _eventsOn(day),
                  selected: true,
                  today: isSameDay(day, DateTime.now()),
                ),
              ),
            ),
          ),
        ),
        Expanded(
          flex: 3,
          child: Container(
            margin: const EdgeInsets.fromLTRB(0, 8, 20, 20),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: scheme.outline.withValues(alpha: 0.2)),
            ),
            child: _DayAgenda(
              day: selectedDay,
              events: _eventsOn(selectedDay),
              sharedEntries: _sharedEntriesOn(selectedDay),
              spaceId: spaceId,
              monthKey: monthKey,
            ),
          ),
        ),
      ],
    );
  }
}

/// One month-grid cell — day number + up to [_maxShown] event title chips,
/// "+N" for the rest (fixed-height grid, not "grow to fit everything";
/// clicking the day still opens the full list in the side agenda panel).
class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.events,
    this.selected = false,
    this.today = false,
    this.outside = false,
  });

  final DateTime day;
  final List<CalendarEvent> events;
  final bool selected;
  final bool today;
  final bool outside;

  static const _maxShown = 2;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shown = events.take(_maxShown).toList();
    final overflow = events.length - shown.length;
    final dayNumberColor = outside
        ? scheme.onSurface.withValues(alpha: 0.35)
        : selected
        ? scheme.primary
        : scheme.onSurface;

    return Container(
      margin: const EdgeInsets.all(2),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: selected ? scheme.primary.withValues(alpha: 0.14) : null,
        borderRadius: BorderRadius.circular(8),
        border: today ? Border.all(color: scheme.primary, width: 1.2) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${day.day}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected || today ? FontWeight.w700 : FontWeight.w500,
              color: dayNumberColor,
            ),
          ),
          const SizedBox(height: 2),
          for (final e in shown)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 1),
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                e.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: scheme.onSurface.withValues(alpha: outside ? 0.5 : 1)),
              ),
            ),
          if (overflow > 0)
            Text(
              '+$overflow',
              style: TextStyle(fontSize: 10, color: scheme.onSurface.withValues(alpha: 0.6)),
            ),
        ],
      ),
    );
  }
}

class _DayAgenda extends ConsumerWidget {
  const _DayAgenda({
    required this.day,
    required this.events,
    required this.sharedEntries,
    required this.spaceId,
    required this.monthKey,
  });

  final DateTime day;
  final List<CalendarEvent> events;
  final List<SharedCalendarEntry> sharedEntries;
  final String spaceId;
  final CalendarMonthKey monthKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${day.year}/${day.month}/${day.day}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              IconButton(
                tooltip: '新增行事曆',
                icon: const Icon(Icons.add_circle_outline),
                onPressed: () => _openEditor(context, ref, null),
              ),
            ],
          ),
        ),
        Expanded(
          child: events.isEmpty && sharedEntries.isEmpty
              ? Center(
                  child: Text('這天沒有行程', style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.5))),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  children: [
                    for (final event in events)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Card(
                          child: ListTile(
                            leading: event.isRecurring
                                ? const Icon(Icons.repeat, size: 18)
                                : null,
                            title: Text(event.title),
                            subtitle: Text(_subtitle(event)),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.edit_outlined, size: 18),
                                  onPressed: () => _editRequested(context, ref, event),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18),
                                  onPressed: () => _deleteRequested(context, ref, event),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    for (final entry in sharedEntries)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Card(
                          child: ListTile(
                            leading: Container(
                              width: 4,
                              margin: const EdgeInsets.symmetric(vertical: 4),
                              decoration: BoxDecoration(
                                color: Color(int.parse(entry.color.replaceFirst('#', '0xFF'))),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            title: Text(entry.title),
                            subtitle: Text('${entry.ownerName} · ${_sharedSubtitle(entry)}'),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  String _sharedSubtitle(SharedCalendarEntry entry) {
    if (entry.allDay) return '全天';
    return '${entry.startAt.hour.toString().padLeft(2, '0')}:${entry.startAt.minute.toString().padLeft(2, '0')}';
  }

  String _subtitle(CalendarEvent event) {
    final parts = <String>[];
    parts.add(
      event.allDay
          ? '全天'
          : '${event.startAt.hour.toString().padLeft(2, '0')}:${event.startAt.minute.toString().padLeft(2, '0')}',
    );
    if (event.location != null && event.location!.isNotEmpty) parts.add(event.location!);
    if (event.googleEventId != null) parts.add('已同步 Google');
    if (event.appleEventUid != null) parts.add('來自 iCloud');
    return parts.join(' · ');
  }

  /// 非循環的一般事件——維持原本行為，一個確認對話框就刪了。
  Future<void> _deleteRequested(BuildContext context, WidgetRef ref, CalendarEvent event) async {
    if (!event.isRecurring) return _delete(context, ref, event);

    final scope = await _pickScope(context, actionLabel: '刪除');
    if (scope == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .deleteCalendarEventOccurrence(
            spaceId: spaceId,
            seriesId: event.seriesId!,
            occurrenceDate: event.occurrenceDate!,
            scope: scope,
          );
      ref.invalidate(calendarEventsProvider(monthKey));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, CalendarEvent event) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除行程'),
        content: Text('確定要刪除「${event.title}」嗎？'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteCalendarEvent(spaceId: spaceId, eventId: event.id);
      ref.invalidate(calendarEventsProvider(monthKey));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  /// 循環事件的某次發生——先問 只改這次／這次以後／全部，再開編輯表單；
  /// 非循環事件維持原本行為，直接開表單。
  Future<void> _editRequested(BuildContext context, WidgetRef ref, CalendarEvent event) async {
    if (!event.isRecurring) return _openEditor(context, ref, event);

    final scope = await _pickScope(context, actionLabel: '編輯');
    if (scope == null || !context.mounted) return;
    await _openEditor(context, ref, event, scope: scope);
  }

  /// Google Calendar 風格的三選一——用在編輯或刪除循環事件的某次發生之前。
  Future<CalendarOccurrenceScope?> _pickScope(BuildContext context, {required String actionLabel}) {
    return showDialog<CalendarOccurrenceScope>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text('$actionLabel循環事件'),
        children: [
          for (final scope in CalendarOccurrenceScope.values)
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(scope),
              child: Text(scope.label),
            ),
        ],
      ),
    );
  }

  Future<void> _openEditor(
    BuildContext context,
    WidgetRef ref,
    CalendarEvent? existing, {
    CalendarOccurrenceScope? scope,
  }) async {
    final titleController = TextEditingController(text: existing?.title ?? '');
    final locationController = TextEditingController(text: existing?.location ?? '');
    final notesController = TextEditingController(text: existing?.notes ?? '');
    var eventDate = existing?.startAt ?? day;
    var allDay = existing?.allDay ?? false;
    var time = TimeOfDay(hour: existing?.startAt.hour ?? 9, minute: existing?.startAt.minute ?? 0);
    var endDate = existing?.endAt ?? eventDate;
    var endTime = existing?.endAt != null
        ? TimeOfDay(hour: existing!.endAt!.hour, minute: existing.endAt!.minute)
        : TimeOfDay(hour: (time.hour + 1) % 24, minute: time.minute);
    var recurrence = existing?.recurrenceFrequency ?? CalendarRecurrenceFrequency.none;
    var recurrenceUntil = existing?.recurrenceUntil;
    // 只改這次不能連帶改循環規則本身——這裡只收「這次」的標題/時間/地點/
    // 備註，循環頻率/結束日對這個 scope 沒有意義，介面上直接不顯示。
    final showRecurrenceFields = scope != CalendarOccurrenceScope.thisOne;

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(
            existing == null
                ? '新增行程'
                : scope != null
                ? '編輯行程（${scope.label}）'
                : '編輯行程',
          ),
          content: SizedBox(
            width: 360,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: titleController,
                    autofocus: true,
                    decoration: const InputDecoration(labelText: '標題'),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: eventDate,
                        firstDate: DateTime(2000),
                        lastDate: DateTime(2100),
                      );
                      if (picked != null) {
                        setState(() {
                          eventDate = picked;
                          if (endDate.isBefore(eventDate)) endDate = eventDate;
                        });
                      }
                    },
                    child: InputDecorator(
                      decoration: InputDecoration(labelText: allDay ? '日期' : '開始日期'),
                      child: Text('${eventDate.year}/${eventDate.month}/${eventDate.day}'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('全天'),
                    value: allDay,
                    onChanged: (v) => setState(() => allDay = v),
                  ),
                  if (!allDay) ...[
                    InkWell(
                      onTap: () async {
                        final picked = await showTimePicker(context: context, initialTime: time);
                        if (picked != null) setState(() => time = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: '開始時間'),
                        child: Text(time.format(context)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: endDate.isBefore(eventDate) ? eventDate : endDate,
                          firstDate: eventDate,
                          lastDate: DateTime(2100),
                        );
                        if (picked != null) setState(() => endDate = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: '結束日期'),
                        child: Text('${endDate.year}/${endDate.month}/${endDate.day}'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: () async {
                        final picked = await showTimePicker(context: context, initialTime: endTime);
                        if (picked != null) setState(() => endTime = picked);
                      },
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: '結束時間'),
                        child: Text(endTime.format(context)),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: locationController,
                    decoration: const InputDecoration(labelText: '地點（選填）'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: '備註（選填）'),
                  ),
                  if (showRecurrenceFields) ...[
                    const SizedBox(height: 12),
                    DropdownButtonFormField<CalendarRecurrenceFrequency>(
                      initialValue: recurrence,
                      decoration: const InputDecoration(labelText: '循環'),
                      items: CalendarRecurrenceFrequency.values
                          .map((f) => DropdownMenuItem(value: f, child: Text(f.label)))
                          .toList(),
                      onChanged: (value) => setState(() => recurrence = value ?? CalendarRecurrenceFrequency.none),
                    ),
                    if (recurrence != CalendarRecurrenceFrequency.none) ...[
                      const SizedBox(height: 12),
                      InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: recurrenceUntil ?? eventDate,
                            firstDate: eventDate,
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) setState(() => recurrenceUntil = picked);
                        },
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: '結束於（選填）',
                            suffixIcon: recurrenceUntil == null
                                ? null
                                : IconButton(
                                    icon: const Icon(Icons.clear, size: 16),
                                    onPressed: () => setState(() => recurrenceUntil = null),
                                  ),
                          ),
                          child: Text(
                            recurrenceUntil == null
                                ? '一直重複'
                                : '${recurrenceUntil!.year}/${recurrenceUntil!.month}/${recurrenceUntil!.day}',
                          ),
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;

    final title = titleController.text.trim();
    if (title.isEmpty) return;
    final location = locationController.text.trim();
    final notes = notesController.text.trim();
    final startAt = allDay
        ? DateTime(eventDate.year, eventDate.month, eventDate.day)
        : DateTime(eventDate.year, eventDate.month, eventDate.day, time.hour, time.minute);
    final endAt = allDay
        ? null
        : DateTime(endDate.year, endDate.month, endDate.day, endTime.hour, endTime.minute);

    try {
      final api = ref.read(apiClientProvider);
      if (existing != null && existing.isRecurring && scope != null) {
        await api.updateCalendarEventOccurrence(
          spaceId: spaceId,
          seriesId: existing.seriesId!,
          occurrenceDate: existing.occurrenceDate!,
          scope: scope,
          title: title,
          startAt: startAt,
          endAt: endAt,
          clearEndAt: allDay,
          allDay: allDay,
          location: location.isEmpty ? null : location,
          clearLocation: location.isEmpty,
          notes: notes.isEmpty ? null : notes,
          clearNotes: notes.isEmpty,
          recurrenceFrequency: showRecurrenceFields ? recurrence : null,
          recurrenceUntil: showRecurrenceFields ? recurrenceUntil : null,
          clearRecurrenceUntil: showRecurrenceFields && recurrenceUntil == null,
        );
      } else if (existing == null) {
        await api.createCalendarEvent(
          spaceId: spaceId,
          title: title,
          startAt: startAt,
          endAt: endAt,
          allDay: allDay,
          location: location.isEmpty ? null : location,
          notes: notes.isEmpty ? null : notes,
          recurrenceFrequency: recurrence,
          recurrenceUntil: recurrenceUntil,
        );
      } else {
        await api.updateCalendarEvent(
          spaceId: spaceId,
          eventId: existing.id,
          title: title,
          startAt: startAt,
          endAt: endAt,
          clearEndAt: allDay,
          allDay: allDay,
          location: location.isEmpty ? null : location,
          clearLocation: location.isEmpty,
          notes: notes.isEmpty ? null : notes,
          clearNotes: notes.isEmpty,
          recurrenceFrequency: recurrence,
          recurrenceUntil: recurrenceUntil,
          clearRecurrenceUntil: recurrenceUntil == null,
        );
      }
      ref.invalidate(calendarEventsProvider(monthKey));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
