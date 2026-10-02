import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/trip.dart';
import '../../../state/auth_provider.dart';
import '../../../state/finance_provider.dart';
import '../../../state/trip_provider.dart';
import '../finance/widgets/finance_format.dart';

String _md(String date) => '${int.parse(date.substring(5, 7))}/${int.parse(date.substring(8))}';
String _key(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
const _weekdays = ['一', '二', '三', '四', '五', '六', '日'];
String _mdw(String date) => '${_md(date)}（${_weekdays[DateTime.parse(date).weekday - 1]}）';

const _styleOptions = ['悠閒慢慢玩', '美食', '購物', '景點排滿', '親子', '自然風景', '文化歷史', '省錢'];

String _statusLabel(Trip t) => switch (t.status) {
  'ongoing' => '旅行中',
  'done' => '去過了',
  _ => t.daysUntil == 0 ? '今天出發' : '還有 ${t.daysUntil} 天',
};

/// 旅行規劃（2026-10-02）：AI 排每日行程、估預算、列行李；可以放進行事曆、
/// 放進購物車存錢；出發前 LINE 提醒。LINE 直接跟 AI 講也可以。
class TripsScreen extends ConsumerStatefulWidget {
  const TripsScreen({super.key});

  @override
  ConsumerState<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends ConsumerState<TripsScreen> {
  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(tripsProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _create,
        icon: const Icon(Icons.auto_awesome),
        label: const Text('規劃旅行'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('讀取失敗：$e')),
        data: (trips) {
          if (trips.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  '還沒有排旅行\n\n按右下角「規劃旅行」，填目的地和日期，AI 會幫你排每天的行程、估預算、列行李清單。\n也可以在 LINE 跟 AI 說「11/1～11/5 想去東京，兩個人」。',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          final selected = trips.where((t) => t.id == _selectedId).firstOrNull ?? trips.first;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 280,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                  children: [
                    for (final t in trips)
                      Card(
                        color: t.id == selected.id ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.10) : null,
                        child: ListTile(
                          leading: Icon(t.status == 'done' ? Icons.flight_land : Icons.flight_takeoff),
                          title: Text(t.destination),
                          subtitle: Text('${_md(t.startDate)}～${_md(t.endDate)}・${_statusLabel(t)}'),
                          onTap: () => setState(() => _selectedId = t.id),
                        ),
                      ),
                  ],
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(child: _TripDetail(key: ValueKey(selected.id), tripId: selected.id)),
            ],
          );
        },
      ),
    );
  }

  Future<void> _create() async {
    final trip = await showDialog<Trip>(context: context, barrierDismissible: false, builder: (_) => const _TripEditor());
    if (trip != null && mounted) {
      ref.invalidate(tripsProvider);
      setState(() => _selectedId = trip.id);
    }
  }
}

class _TripDetail extends ConsumerWidget {
  const _TripDetail({super.key, required this.tripId});

  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(tripProvider(tripId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('讀取失敗：$e')),
      data: (t) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          _Header(trip: t),
          const SizedBox(height: 12),
          _BudgetCard(trip: t),
          const SizedBox(height: 12),
          _ItineraryCard(trip: t),
          const SizedBox(height: 12),
          _PackingCard(trip: t),
        ],
      ),
    );
  }
}

/// 呼叫 API、成功就重新整理這趟和列表；失敗顯示後端的中文訊息。
Future<T?> _run<T>(BuildContext context, WidgetRef ref, String tripId, Future<T> Function() action, {String? done}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final messenger = ScaffoldMessenger.of(context);
  try {
    final result = await action();
    container.invalidate(tripProvider(tripId));
    container.invalidate(tripsProvider);
    if (done != null) messenger.showSnackBar(SnackBar(content: Text(done)));
    return result;
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
    return null;
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = trip;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('✈️ ${t.destination}', style: theme.textTheme.headlineSmall)),
                Chip(label: Text(_statusLabel(t))),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              [
                '${_mdw(t.startDate)}～${_mdw(t.endDate)}，${t.days} 天',
                if (t.travelers > 1) '${t.travelers} 人',
                if (t.style != null) t.style!,
              ].join('・'),
              style: theme.textTheme.bodyMedium,
            ),
            if (t.tips != null) ...[
              const SizedBox(height: 8),
              Text('💡 ${t.tips}', style: theme.textTheme.bodySmall),
            ],
            if (t.notes != null) ...[
              const SizedBox(height: 4),
              Text('備註：${t.notes}', style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (t.status != 'done')
                  t.inCalendar
                      ? const Chip(avatar: Icon(Icons.check, size: 16), label: Text('已在行事曆'))
                      : OutlinedButton.icon(
                          onPressed: () => _addToCalendar(context, ref),
                          icon: const Icon(Icons.event_available_outlined, size: 18),
                          label: const Text('放進行事曆'),
                        ),
                if (t.status == 'upcoming')
                  t.inWishlist
                      ? const Chip(avatar: Icon(Icons.check, size: 16), label: Text('已在購物車存錢'))
                      : OutlinedButton.icon(
                          onPressed: t.budgetTotal == null ? null : () => _saveFor(context, ref),
                          icon: const Icon(Icons.savings_outlined, size: 18),
                          label: const Text('放進購物車存錢'),
                        ),
                if (t.status == 'upcoming')
                  OutlinedButton.icon(
                    onPressed: () => _replan(context, ref),
                    icon: const Icon(Icons.auto_awesome, size: 18),
                    label: Text(t.itinerary.any((d) => d.items.isNotEmpty) ? 'AI 重新規劃' : 'AI 幫我規劃'),
                  ),
                OutlinedButton.icon(
                  onPressed: () async {
                    final saved = await showDialog<Trip>(context: context, builder: (_) => _TripEditor(existing: t));
                    if (saved != null && context.mounted) {
                      ref.invalidate(tripProvider(t.id));
                      ref.invalidate(tripsProvider);
                    }
                  },
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('修改'),
                ),
                TextButton.icon(
                  onPressed: () => _delete(context, ref),
                  icon: const Icon(Icons.delete_outline, size: 18),
                  label: const Text('刪除'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addToCalendar(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    final targets = await ref.read(tripCalendarTargetsProvider.future);
    String? target;
    if (targets.length == 1) {
      target = targets.first;
    } else if (targets.length > 1) {
      if (!context.mounted) return;
      target = await showDialog<String>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('存到哪一邊？'),
          children: [
            for (final x in targets)
              SimpleDialogOption(
                onPressed: () => Navigator.of(context).pop(x),
                child: Text(x == 'GOOGLE' ? 'Google 日曆' : 'iPhone 行事曆'),
              ),
          ],
        ),
      );
      if (target == null) return;
    }
    if (!context.mounted) return;
    await _run(context, ref, trip.id, () => api.addTripToCalendar(trip.id, target: target), done: '已放進行事曆');
  }

  Future<void> _saveFor(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    final container = ProviderScope.containerOf(context, listen: false);
    final r = await _run(context, ref, trip.id, () => api.saveForTrip(trip.id));
    if (r == null || !context.mounted) return;
    container.invalidate(wishlistProvider);
    final month = r['affordableMonth'] as String?;
    final onTime = r['onTime'] as bool?;
    final needed = (r['neededMonthly'] as num?)?.toDouble();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 6),
        content: Text(
          onTime == false && needed != null
              ? '已放進購物車。照現在每月撥的錢趕不上出發，要趕上每月要撥 ${formatAmount(needed)}（可以到財務「購物車」調整）'
              : '已放進購物車${month != null ? '，大概 ${int.parse(month.substring(5))} 月存得到' : ''}',
        ),
      ),
    );
  }

  Future<void> _replan(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(content: Text('AI 規劃中，大概要 10～30 秒…')));
    await _run(context, ref, trip.id, () => api.replanTrip(trip.id), done: '規劃好了');
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('刪除「${trip.destination}」？'),
        content: Text(trip.inCalendar ? '購物車的存錢項目會一起拿掉；行事曆上的行程要自己刪。' : '購物車的存錢項目會一起拿掉。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final container = ProviderScope.containerOf(context, listen: false);
    await ref.read(apiClientProvider).deleteTrip(trip.id);
    container.invalidate(tripsProvider);
    container.invalidate(wishlistProvider);
  }
}

class _BudgetCard extends ConsumerWidget {
  const _BudgetCard({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = trip;
    final theme = Theme.of(context);
    final budget = t.budget;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.budgetTotal == null ? '預算' : '預估花費 ${formatAmount(t.budgetTotal!)} 元${t.travelers > 1 ? '（${t.travelers} 人合計）' : ''}',
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                TextButton(onPressed: () => _editBudget(context, ref), child: const Text('調整')),
              ],
            ),
            if (budget != null)
              Wrap(
                spacing: 16,
                runSpacing: 4,
                children: [
                  for (final k in tripBudgetKeys)
                    if ((budget[k] ?? 0) > 0) Text('${tripBudgetLabels[k]} ${formatAmount(budget[k]!)}'),
                ],
              )
            else
              Text('還沒有預算，按「AI 幫我規劃」或「調整」自己填', style: theme.textTheme.bodySmall),
            if (t.spent != null) ...[
              const Divider(height: 24),
              Text(
                '旅行期間記帳的支出：${formatAmount(t.spent!)} 元'
                '${t.budgetTotal != null ? (t.spent! > t.budgetTotal! ? '（超出 ${formatAmount(t.spent! - t.budgetTotal!)}）' : '（還剩 ${formatAmount(t.budgetTotal! - t.spent!)}）') : ''}',
                style: theme.textTheme.titleSmall?.copyWith(
                  color: t.budgetTotal != null && t.spent! > t.budgetTotal! ? theme.colorScheme.error : null,
                ),
              ),
              if (t.spentByCategory.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    t.spentByCategory.take(5).map((c) => '${c.name} ${formatAmount(c.total)}').join('・'),
                    style: theme.textTheme.bodySmall,
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _editBudget(BuildContext context, WidgetRef ref) async {
    final controllers = {
      for (final k in tripBudgetKeys) k: TextEditingController(text: (trip.budget?[k] ?? 0) > 0 ? trip.budget![k]!.round().toString() : ''),
    };
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('調整預算'),
        content: SizedBox(
          width: 320,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final k in tripBudgetKeys)
                TextField(
                  controller: controllers[k],
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: tripBudgetLabels[k], suffixText: '元'),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('儲存')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final budget = {for (final k in tripBudgetKeys) k: double.tryParse(controllers[k]!.text.trim().replaceAll(',', '')) ?? 0};
    await _run(context, ref, trip.id, () => ref.read(apiClientProvider).updateTrip(trip.id, {'budget': budget}));
  }
}

class _ItineraryCard extends ConsumerWidget {
  const _ItineraryCard({required this.trip});

  final Trip trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final today = _key(DateTime.now());
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('每日行程', style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('點某一天可以改；也可以在 LINE 跟 AI 說「第二天改去鎌倉」', style: theme.textTheme.bodySmall),
            const SizedBox(height: 8),
            for (final (i, day) in trip.itinerary.indexed)
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => _editDay(context, ref, day),
                child: Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: day.date == today ? theme.colorScheme.primary : theme.colorScheme.outlineVariant),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Day ${i + 1}・${_mdw(day.date)}${day.date == today ? '・今天' : ''}', style: theme.textTheme.labelLarge),
                      const SizedBox(height: 4),
                      if (day.items.isEmpty)
                        Text('還沒排', style: theme.textTheme.bodySmall)
                      else
                        for (final item in day.items)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(width: 52, child: Text(item.time ?? '', style: theme.textTheme.bodySmall)),
                                Expanded(
                                  child: Text.rich(
                                    TextSpan(
                                      children: [
                                        TextSpan(text: item.title),
                                        if (item.place != null && item.place != item.title)
                                          TextSpan(text: '  📍${item.place}', style: theme.textTheme.bodySmall),
                                        if (item.note != null) TextSpan(text: '\n${item.note}', style: theme.textTheme.bodySmall),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// 一行一個：「09:00 淺草寺 @淺草」（時間、@地點都可以不寫）。
  Future<void> _editDay(BuildContext context, WidgetRef ref, TripDay day) async {
    final controller = TextEditingController(
      text: day.items.map((i) => [if (i.time != null) i.time, i.title, if (i.place != null && i.place != i.title) '@${i.place}'].join(' ')).join('\n'),
    );
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${_mdw(day.date)} 的行程'),
        content: SizedBox(
          width: 420,
          child: TextField(
            controller: controller,
            autofocus: true,
            minLines: 6,
            maxLines: 14,
            decoration: const InputDecoration(
              helperText: '一行一個，例如「09:00 淺草寺 @淺草」，時間和 @地點可以不寫',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('儲存')),
        ],
      ),
    );
    if (result == null || !context.mounted) return;
    final old = {for (final i in day.items) i.title: i};
    final items = <TripItineraryItem>[];
    for (final raw in result.split('\n')) {
      var line = raw.trim();
      if (line.isEmpty) continue;
      String? time;
      final m = RegExp(r'^(\d{1,2}:\d{2})\s*').firstMatch(line);
      if (m != null) {
        time = m.group(1)!.padLeft(5, '0');
        line = line.substring(m.end);
      }
      String? place;
      final at = line.lastIndexOf('@');
      if (at > 0) {
        place = line.substring(at + 1).trim();
        line = line.substring(0, at).trim();
      }
      if (line.isEmpty) continue;
      // 沒改到的項目保留原本的提醒文字。
      items.add(TripItineraryItem(time: time, title: line, place: place ?? old[line]?.place, note: old[line]?.note));
    }
    final itinerary = [
      for (final d in trip.itinerary) d.date == day.date ? TripDay(date: d.date, items: items).toJson() : d.toJson(),
    ];
    await _run(context, ref, trip.id, () => ref.read(apiClientProvider).updateTrip(trip.id, {'itinerary': itinerary}));
  }
}

class _PackingCard extends ConsumerStatefulWidget {
  const _PackingCard({required this.trip});

  final Trip trip;

  @override
  ConsumerState<_PackingCard> createState() => _PackingCardState();
}

class _PackingCardState extends ConsumerState<_PackingCard> {
  late List<PackingItem> _items = widget.trip.packingList;
  final _add = TextEditingController();

  @override
  void didUpdateWidget(covariant _PackingCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _items = widget.trip.packingList;
  }

  @override
  void dispose() {
    _add.dispose();
    super.dispose();
  }

  Future<void> _save(List<PackingItem> next) async {
    setState(() => _items = next);
    try {
      await ref.read(apiClientProvider).setTripPacking(widget.trip.id, next);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  void _addItem() {
    final text = _add.text.trim();
    if (text.isEmpty) return;
    _add.clear();
    _save([..._items, PackingItem(item: text, packed: false)]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final left = _items.where((p) => !p.packed).length;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _items.isEmpty ? '行李清單' : (left == 0 ? '行李清單（都準備好了 👍）' : '行李清單（還差 $left 樣）'),
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final (i, p) in _items.indexed)
                  FilterChip(
                    label: Text(p.item, style: p.packed ? const TextStyle(decoration: TextDecoration.lineThrough) : null),
                    selected: p.packed,
                    onSelected: (v) => _save([for (final (j, q) in _items.indexed) j == i ? PackingItem(item: q.item, packed: v) : q]),
                    onDeleted: () => _save([for (final (j, q) in _items.indexed) if (j != i) q]),
                    deleteIcon: const Icon(Icons.close, size: 14),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _add,
                    decoration: const InputDecoration(hintText: '加一樣要帶的', isDense: true),
                    onSubmitted: (_) => _addItem(),
                  ),
                ),
                IconButton(onPressed: _addItem, icon: const Icon(Icons.add)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 新增（AI 規劃）或修改基本資料。新增成功回傳 Trip。
class _TripEditor extends ConsumerStatefulWidget {
  const _TripEditor({this.existing});

  final Trip? existing;

  @override
  ConsumerState<_TripEditor> createState() => _TripEditorState();
}

class _TripEditorState extends ConsumerState<_TripEditor> {
  late final _destination = TextEditingController(text: widget.existing?.destination ?? '');
  late final _notes = TextEditingController(text: widget.existing?.notes ?? '');
  late DateTimeRange? _range = widget.existing == null
      ? null
      : DateTimeRange(start: DateTime.parse(widget.existing!.startDate), end: DateTime.parse(widget.existing!.endDate));
  late int _travelers = widget.existing?.travelers ?? 1;
  late final Set<String> _styles = {...?widget.existing?.style?.split('、').where((s) => s.isNotEmpty)};
  bool _saving = false;

  @override
  void dispose() {
    _destination.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 3),
      initialDateRange: _range,
      helpText: '出發和回來的日期',
    );
    if (picked != null) setState(() => _range = picked);
  }

  Future<void> _submit({required bool plan}) async {
    final destination = _destination.text.trim();
    final range = _range;
    if (destination.isEmpty || range == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('要填目的地和日期')));
      return;
    }
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    final style = _styles.isEmpty ? null : _styles.join('、');
    final notes = _notes.text.trim().isEmpty ? null : _notes.text.trim();
    try {
      final existing = widget.existing;
      final trip = existing == null
          ? await api.createTrip(
              destination: destination,
              startDate: _key(range.start),
              endDate: _key(range.end),
              travelers: _travelers,
              style: style,
              notes: notes,
              plan: plan,
            )
          : await api.updateTrip(existing.id, {
              'destination': destination,
              'startDate': _key(range.start),
              'endDate': _key(range.end),
              'travelers': _travelers,
              'style': style,
              'notes': notes,
            });
      if (mounted) Navigator.of(context).pop(trip);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isNew = widget.existing == null;
    final r = _range;
    return AlertDialog(
      title: Text(isNew ? '想去哪裡玩？' : '修改旅行'),
      content: SizedBox(
        width: 420,
        child: _saving
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text('AI 正在排行程、估預算、列行李…\n大概要 10～30 秒', textAlign: TextAlign.center),
                  ],
                ),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _destination,
                    autofocus: isNew,
                    decoration: const InputDecoration(labelText: '目的地', hintText: '例如 東京、花蓮、首爾'),
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: _pickRange,
                    child: InputDecorator(
                      decoration: const InputDecoration(labelText: '日期', suffixIcon: Icon(Icons.date_range_outlined, size: 18)),
                      child: Text(
                        r == null ? '選出發和回來的日期' : '${r.start.month}/${r.start.day}～${r.end.month}/${r.end.day}，${r.duration.inDays + 1} 天',
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const Text('幾個人'),
                      const Spacer(),
                      IconButton(
                        onPressed: _travelers > 1 ? () => setState(() => _travelers--) : null,
                        icon: const Icon(Icons.remove_circle_outline),
                      ),
                      Text('$_travelers'),
                      IconButton(onPressed: () => setState(() => _travelers++), icon: const Icon(Icons.add_circle_outline)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text('想怎麼玩（可以多選）'),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final s in _styleOptions)
                        FilterChip(
                          label: Text(s),
                          selected: _styles.contains(s),
                          onSelected: (v) => setState(() => v ? _styles.add(s) : _styles.remove(s)),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notes,
                    decoration: const InputDecoration(labelText: '補充（可不填）', hintText: '例如 想去迪士尼、不吃生食、帶長輩'),
                  ),
                  if (!isNew)
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text('改了目的地或日期，存好後可以按「AI 重新規劃」重排行程。', style: TextStyle(fontSize: 12)),
                    ),
                ],
              ),
      ),
      actions: _saving
          ? null
          : [
              TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
              if (isNew) TextButton(onPressed: () => _submit(plan: false), child: const Text('先存起來，自己排')),
              FilledButton.icon(
                onPressed: () => _submit(plan: isNew),
                icon: Icon(isNew ? Icons.auto_awesome : Icons.check, size: 18),
                label: Text(isNew ? 'AI 幫我規劃' : '儲存'),
              ),
            ],
    );
  }
}
