import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/wishlist.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';

const _priorityLabel = {1: '高', 2: '中', 3: '低'};

String _monthLabel(String month) {
  final now = DateTime.now();
  final y = int.parse(month.substring(0, 4));
  final m = int.parse(month.substring(5));
  if (y == now.year && m == now.month) return '這個月';
  return y == now.year ? '$m 月' : '$y/$m 月';
}

/// 購物車：想買的東西＋價格，照每月撥的錢排出大概哪個月買得起（2026-10-02）。
/// 主要用 LINE 講（「想買 AirPods 7490」），這裡可以看、改、劃掉。
class FinanceWishlistTab extends ConsumerWidget {
  const FinanceWishlistTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(wishlistProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(context, ref, null),
        icon: const Icon(Icons.add_shopping_cart),
        label: const Text('想買'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('讀取失敗：$e')),
        data: (o) => ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
          children: [
            _BudgetCard(overview: o),
            const SizedBox(height: 12),
            if (o.items.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  '購物車是空的\n按右下角「想買」，或在 LINE 跟 AI 說「想買 AirPods 7490」',
                  textAlign: TextAlign.center,
                ),
              )
            else
              for (final item in o.items) _ItemCard(item: item, onEdit: () => _edit(context, ref, item)),
          ],
        ),
      ),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, WishlistItem? existing) async {
    final saved = await showDialog<bool>(context: context, builder: (_) => _ItemEditor(existing: existing));
    if (saved == true && context.mounted) ref.invalidate(wishlistProvider);
  }
}

class _BudgetCard extends ConsumerWidget {
  const _BudgetCard({required this.overview});

  final WishlistOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = overview;
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('購物車共 ${formatAmount(o.total)}', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    o.monthlyBudget > 0
                        ? '每月撥 ${formatAmount(o.monthlyBudget)} 買東西'
                            '${o.budgetIsCustom ? '' : '（近 3 個月平均結餘 ${formatAmount(o.averageMonthlySurplus)} 的 30%）'}'
                        : '近 3 個月平均沒有結餘（${formatAmount(o.averageMonthlySurplus)}），排不出時間，可以自己設每月撥多少',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            TextButton(onPressed: () => _editBudget(context, ref), child: const Text('調整')),
          ],
        ),
      ),
    );
  }

  Future<void> _editBudget(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: overview.budgetIsCustom ? overview.monthlyBudget.toStringAsFixed(0) : '');
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('每月撥多少買東西？'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            hintText: '空白＝用預設（${formatAmount(overview.suggestedBudget)}）',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('儲存')),
        ],
      ),
    );
    if (result == null || !context.mounted) return;
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await ref.read(apiClientProvider).setWishlistBudget(double.tryParse(result.trim()));
      container.invalidate(wishlistProvider);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

class _ItemCard extends ConsumerWidget {
  const _ItemCard({required this.item, required this.onEdit});

  final WishlistItem item;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final when = item.affordableMonth == null ? '目前排不出來' : '${_monthLabel(item.affordableMonth!)}買得起';
    return Card(
      child: ListTile(
        title: Text('${item.name}  ${formatAmount(item.price)}'),
        subtitle: Text(
          [
            '優先：${_priorityLabel[item.priority] ?? '中'}・$when',
            if (item.targetDate != null) '想在 ${item.targetDate!.substring(5).replaceAll('-', '/')} 前買',
            if (item.onTime == false && item.neededMonthly != null) '⚠️ 要趕上，每月要撥 ${formatAmount(item.neededMonthly!)}',
            if (item.note != null) item.note!,
          ].join('\n'),
          style: item.onTime == false ? TextStyle(color: theme.colorScheme.error) : null,
        ),
        isThreeLine: item.targetDate != null || item.note != null,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(onPressed: () => _bought(context, ref), child: const Text('買了')),
            IconButton(tooltip: '修改', icon: const Icon(Icons.edit_outlined, size: 18), onPressed: onEdit),
            IconButton(
              tooltip: '不買了',
              icon: const Icon(Icons.delete_outline, size: 18),
              onPressed: () async {
                final container = ProviderScope.containerOf(context, listen: false);
                await ref.read(apiClientProvider).deleteWishlistItem(item.id);
                container.invalidate(wishlistProvider);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _bought(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: item.price.toStringAsFixed(0));
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('「${item.name}」買了'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: '實際花了多少'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('劃掉')),
        ],
      ),
    );
    if (result == null || !context.mounted) return;
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    await ref.read(apiClientProvider).markWishlistBought(item.id, actualPrice: double.tryParse(result.trim()));
    container.invalidate(wishlistProvider);
    messenger.showSnackBar(const SnackBar(content: Text('已劃掉，記得到「交易」記一筆支出（或在 LINE 跟 AI 說，它會一起記）')));
  }
}

class _ItemEditor extends ConsumerStatefulWidget {
  const _ItemEditor({this.existing});

  final WishlistItem? existing;

  @override
  ConsumerState<_ItemEditor> createState() => _ItemEditorState();
}

class _ItemEditorState extends ConsumerState<_ItemEditor> {
  late final _name = TextEditingController(text: widget.existing?.name ?? '');
  late final _price = TextEditingController(text: widget.existing?.price.toStringAsFixed(0) ?? '');
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  late int _priority = widget.existing?.priority ?? 2;
  late DateTime? _target = widget.existing?.targetDate == null ? null : DateTime.parse(widget.existing!.targetDate!);
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    final price = double.tryParse(_price.text.trim());
    if (name.isEmpty || price == null || price <= 0) return;
    setState(() => _saving = true);
    try {
      final t = _target;
      await ref.read(apiClientProvider).saveWishlistItem(
        id: widget.existing?.id,
        name: name,
        price: price,
        priority: _priority,
        targetDate: t == null ? null : '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}',
        note: _note.text.trim().isEmpty ? null : _note.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? '想買什麼？' : '修改'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _name, autofocus: true, decoration: const InputDecoration(labelText: '名稱')),
            const SizedBox(height: 12),
            TextField(
              controller: _price,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '價格'),
            ),
            const SizedBox(height: 12),
            SegmentedButton<int>(
              segments: const [
                ButtonSegment(value: 1, label: Text('很需要')),
                ButtonSegment(value: 2, label: Text('想要')),
                ButtonSegment(value: 3, label: Text('有閒錢再買')),
              ],
              selected: {_priority},
              onSelectionChanged: (s) => setState(() => _priority = s.first),
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _target ?? DateTime.now().add(const Duration(days: 60)),
                  firstDate: DateTime.now(),
                  lastDate: DateTime(2100),
                );
                if (picked != null) setState(() => _target = picked);
              },
              child: InputDecorator(
                decoration: InputDecoration(
                  labelText: '想在哪天前買到（可不填）',
                  suffixIcon: _target == null
                      ? const Icon(Icons.event_outlined, size: 18)
                      : IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => _target = null)),
                ),
                child: Text(_target == null ? '不設定' : '${_target!.year}/${_target!.month}/${_target!.day}'),
              ),
            ),
            const SizedBox(height: 12),
            TextField(controller: _note, decoration: const InputDecoration(labelText: '備註（可不填）')),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
        FilledButton(onPressed: _saving ? null : _save, child: const Text('儲存')),
      ],
    );
  }
}
