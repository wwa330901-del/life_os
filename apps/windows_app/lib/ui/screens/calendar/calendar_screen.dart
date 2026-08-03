import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../core/api_client.dart';
import '../../../core/models/app_user.dart';
import '../../../core/models/calendar_event.dart';
import '../../../core/theme/app_theme.dart';
import '../../../services/auth/google_oauth_service.dart';
import '../../../state/auth_provider.dart';
import '../../../state/calendar_provider.dart';

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

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  DateTime get _monthStart => DateTime(_focusedDay.year, _focusedDay.month, 1);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final key = CalendarMonthKey(widget.space.id, _monthStart);
    final eventsAsync = ref.watch(calendarEventsProvider(key));

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
                _GoogleConnectButton(spaceId: widget.space.id),
              ],
            ),
          ),
        ),
        Expanded(
          child: eventsAsync.when(
            data: (events) => _CalendarBody(
              events: events,
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

class _CalendarBody extends ConsumerWidget {
  const _CalendarBody({
    required this.events,
    required this.focusedDay,
    required this.selectedDay,
    required this.onPageChanged,
    required this.onDaySelected,
    required this.spaceId,
    required this.monthKey,
  });

  final List<CalendarEvent> events;
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
  const _DayAgenda({required this.day, required this.events, required this.spaceId, required this.monthKey});

  final DateTime day;
  final List<CalendarEvent> events;
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
          child: events.isEmpty
              ? Center(
                  child: Text('這天沒有行程', style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.5))),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  itemCount: events.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (context, index) {
                    final event = events[index];
                    return Card(
                      child: ListTile(
                        title: Text(event.title),
                        subtitle: Text(_subtitle(event)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              onPressed: () => _openEditor(context, ref, event),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18),
                              onPressed: () => _delete(context, ref, event),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
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
    return parts.join(' · ');
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

  Future<void> _openEditor(BuildContext context, WidgetRef ref, CalendarEvent? existing) async {
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

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existing == null ? '新增行程' : '編輯行程'),
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
      if (existing == null) {
        await api.createCalendarEvent(
          spaceId: spaceId,
          title: title,
          startAt: startAt,
          endAt: endAt,
          allDay: allDay,
          location: location.isEmpty ? null : location,
          notes: notes.isEmpty ? null : notes,
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
