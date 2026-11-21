import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/finance.dart';
import '../../../../core/models/reconciliation.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../../../../state/home_provider.dart';
import '../../../widgets/error_panel.dart';
import 'finance_format.dart';

/// 平帳：好幾天沒記帳時，填帳戶現在實際有多少，差額記成一筆「忘記記帳」，之前的帳不動。
Future<void> showReconcileDialog(BuildContext context, WidgetRef ref, String spaceId, FinanceAccount account) async {
  final done = await showDialog<bool>(
    context: context,
    builder: (_) => _ReconcileDialog(spaceId: spaceId, account: account),
  );
  if (done != true) return;
  ref.invalidate(financeAccountsProvider);
  ref.invalidate(financeTransactionsProvider);
  ref.invalidate(homeDashboardProvider);
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('「${account.name}」平帳好了')));
  }
}

class _ReconcileDialog extends ConsumerStatefulWidget {
  const _ReconcileDialog({required this.spaceId, required this.account});

  final String spaceId;
  final FinanceAccount account;

  @override
  ConsumerState<_ReconcileDialog> createState() => _ReconcileDialogState();
}

class _ReconcileDialogState extends ConsumerState<_ReconcileDialog> {
  final _controller = TextEditingController();
  Timer? _debounce;
  ReconcilePreview? _preview;
  String? _inputError;
  Object? _error;
  bool _saving = false;

  bool get _isCard => widget.account.type == FinanceAccountType.creditCard;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  /// 信用卡填的是「現在欠多少」，存成負數。
  double? get _actual {
    final text = _controller.text.replaceAll(',', '').trim();
    if (text.isEmpty) return null;
    final value = double.tryParse(text);
    if (value == null) return null;
    return _isCard ? -value.abs() : value;
  }

  void _onChanged(String _) {
    _debounce?.cancel();
    final actual = _actual;
    setState(() {
      _inputError = _controller.text.trim().isNotEmpty && actual == null ? '金額只能打數字，例如 5000' : null;
      _preview = null;
      _error = null;
    });
    if (actual == null) return;
    _debounce = Timer(const Duration(milliseconds: 400), () => _loadPreview(actual));
  }

  Future<void> _loadPreview(double actual) async {
    try {
      final preview = await ref
          .read(apiClientProvider)
          .previewReconcile(spaceId: widget.spaceId, accountId: widget.account.id, actualBalance: actual);
      if (mounted && _actual == actual) setState(() => _preview = preview);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _submit() async {
    final actual = _actual;
    if (actual == null) {
      setState(() => _inputError = '請填帳戶現在實際有多少');
      return;
    }
    setState(() => _saving = true);
    try {
      await ref
          .read(apiClientProvider)
          .reconcileAccount(spaceId: widget.spaceId, accountId: widget.account.id, actualBalance: actual);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final preview = _preview;
    final book = widget.account.balance;
    return AlertDialog(
      title: Text('平帳：${widget.account.name}'),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '好幾天沒記帳？填這個帳戶「現在真的有多少」，差的金額會記成一筆「忘記記帳」。之前記的帳一筆都不會動。',
                style: TextStyle(color: scheme.onSurfaceVariant, height: 1.5),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Text('元序帳上', style: TextStyle(color: scheme.onSurfaceVariant)),
                  const Spacer(),
                  Text(
                    _isCard && book < 0 ? '欠 ${formatAmount(-book)}' : formatAmount(book),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _controller,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  labelText: _isCard ? '這張卡現在實際欠多少' : '現在實際有多少',
                  errorText: _inputError,
                ),
                onChanged: _onChanged,
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 16),
              if (preview != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: preview.difference == 0 ? scheme.surfaceContainerHighest : scheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    preview.difference == 0
                        ? '跟帳上一樣，不用平帳'
                        : preview.difference < 0
                        ? '少了 ${formatAmount(-preview.difference)}，會記一筆「${preview.categoryName ?? '忘記記帳'}」支出 ${formatAmount(-preview.difference)}（今天）'
                        : '多了 ${formatAmount(preview.difference)}，會記一筆「${preview.categoryName ?? '多出來的錢'}」收入 ${formatAmount(preview.difference)}（今天）',
                    style: TextStyle(color: scheme.onSecondaryContainer, height: 1.5),
                  ),
                ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(FriendlyError.from(_error!).message, style: TextStyle(color: scheme.error)),
                if (FriendlyError.from(_error!).detail.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ErrorDetailBox(detail: FriendlyError.from(_error!).detail),
                ],
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
        FilledButton(
          onPressed: _saving || preview == null || preview.difference == 0 ? null : _submit,
          child: const Text('平帳'),
        ),
      ],
    );
  }
}

/// 平帳紀錄：每次平帳的日期、帳戶、帳上→實際、差額，加上今年每個帳戶合計。
Future<void> showReconciliationHistory(BuildContext context, String spaceId) {
  return showDialog<void>(
    context: context,
    builder: (_) => _ReconciliationHistoryDialog(spaceId: spaceId),
  );
}

class _ReconciliationHistoryDialog extends ConsumerWidget {
  const _ReconciliationHistoryDialog({required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('平帳紀錄'),
      content: SizedBox(
        width: 520,
        child: FutureBuilder<ReconciliationHistory>(
          future: ref.read(apiClientProvider).listReconciliations(spaceId),
          builder: (context, snap) {
            if (snap.hasError) return ErrorPanel(error: snap.error!);
            final data = snap.data;
            if (data == null) return const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()));
            if (data.items.isEmpty) return const Text('還沒有平帳過');
            String diff(double d) => d < 0 ? '−${formatAmount(-d)}' : '+${formatAmount(d)}';
            return SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '今年忘記記的：${data.thisYear.entries.map((e) => '${e.key} ${diff(e.value)}').join('・')}',
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 12),
                  for (final r in data.items)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${r.date.month}/${r.date.day}・${r.accountName}'),
                      subtitle: Text('帳上 ${formatAmount(r.bookBalance)} → 實際 ${formatAmount(r.actualBalance)}'),
                      trailing: Text(
                        diff(r.difference),
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: r.difference < 0 ? scheme.error : scheme.primary,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
    );
  }
}
