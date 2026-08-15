import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../core/models/project.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/date_range_filter.dart';
import '../widgets/finance_format.dart';

/// 工作上先幫忙出錢，之後公司/專案還你 — same shape/mechanic as `FinanceLoansTab`
/// (see the backend's `FinanceAdvance` doc comment for why this is a
/// separate feature), plus an optional project link so a project's own
/// screen can eventually surface "還沒收回的代墊".
class FinanceAdvancesTab extends ConsumerStatefulWidget {
  const FinanceAdvancesTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<FinanceAdvancesTab> createState() => _FinanceAdvancesTabState();
}

class _FinanceAdvancesTabState extends ConsumerState<FinanceAdvancesTab> {
  bool _showSettled = false;
  DateTime? _from;
  DateTime? _to;
  final _scrollController = ScrollController();

  FinanceAdvancesQuery get _query =>
      (spaceId: widget.spaceId, settled: _showSettled ? null : false, from: _from, to: _to);

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels < _scrollController.position.maxScrollExtent - 200) return;
    ref.read(financeAdvancesProvider(_query).notifier).loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final advancesAsync = ref.watch(financeAdvancesProvider(_query));
    final accountsAsync = ref.watch(financeAccountsProvider(widget.spaceId));
    final projectsAsync = ref.watch(myProjectsProvider);
    final accounts = accountsAsync.value ?? const [];
    final projects = projectsAsync.value ?? const [];
    final accountNameOf = {for (final a in accounts) a.id: a.name};

    return Scaffold(
      floatingActionButton: accounts.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openCreateDialog(context, accounts, projects),
              icon: const Icon(Icons.add),
              label: const Text('新增代墊'),
            ),
      body: accounts.isEmpty
          ? const Center(child: Text('要先在「帳戶」分頁新增至少一個帳戶'))
          : advancesAsync.when(
              data: (page) {
                final visible = page.items;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          FilterChip(
                            label: Text(dateRangeFilterLabel(_from, _to)),
                            selected: _from != null || _to != null,
                            onSelected: (_) => _openDateRangeFilter(context),
                          ),
                          const SizedBox(width: 8),
                          FilterChip(
                            label: const Text('顯示已收回'),
                            selected: _showSettled,
                            onSelected: (v) => setState(() => _showSettled = v),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: visible.isEmpty
                          ? Center(
                              child: Text(_showSettled ? '還沒有任何代墊' : '目前沒有未收回的代墊'),
                            )
                          : ListView.separated(
                              controller: _scrollController,
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                              itemCount: visible.length + (page.hasMore ? 1 : 0),
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                if (index >= visible.length) {
                                  return const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 16),
                                    child: Center(child: CircularProgressIndicator()),
                                  );
                                }
                                final advance = visible[index];
                                return _AdvanceCard(
                                  advance: advance,
                                  accountNameOf: accountNameOf,
                                  onRepay: advance.settled
                                      ? null
                                      : () => _openRepayDialog(context, accounts, advance),
                                  onEdit: () => _openEditDialog(context, accounts, projects, advance),
                                  onDelete: () => _delete(context, advance),
                                  onEditRepayment: (r) =>
                                      _openRepaymentEditDialog(context, accounts, advance, r),
                                );
                              },
                            ),
                    ),
                  ],
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取代墊失敗：$error')),
            ),
    );
  }

  void _invalidate() => ref.invalidate(financeAdvancesProvider(_query));

  Future<void> _openDateRangeFilter(BuildContext context) async {
    final result = await showDateRangeFilterDialog(context, initialFrom: _from, initialTo: _to);
    if (result == null) return;
    setState(() {
      _from = result.$1;
      _to = result.$2;
    });
  }

  Future<void> _delete(BuildContext context, FinanceAdvance advance) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除代墊'),
        content: const Text('確定要刪除這筆代墊紀錄嗎？連同已登記的收回一起刪除，這個動作無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteFinanceAdvance(spaceId: widget.spaceId, id: advance.id);
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openCreateDialog(
    BuildContext context,
    List<FinanceAccount> accounts,
    List<MyProjectSummary> projects,
  ) async {
    final result = await showDialog<_AdvanceCreateResult>(
      context: context,
      builder: (_) => _AdvanceCreateDialog(accounts: accounts, projects: projects),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .createFinanceAdvance(
            spaceId: widget.spaceId,
            title: result.title,
            amount: result.amount,
            accountId: result.accountId,
            date: result.date,
            note: result.note,
            projectId: result.projectId,
          );
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditDialog(
    BuildContext context,
    List<FinanceAccount> accounts,
    List<MyProjectSummary> projects,
    FinanceAdvance advance,
  ) async {
    final result = await showDialog<_AdvanceCreateResult>(
      context: context,
      builder: (_) => _AdvanceCreateDialog(accounts: accounts, projects: projects, existing: advance),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .updateFinanceAdvance(
            spaceId: widget.spaceId,
            id: advance.id,
            title: result.title,
            amount: result.amount,
            accountId: result.accountId,
            date: result.date,
            note: result.note ?? '',
            projectId: result.projectId,
            clearProjectId: result.projectId == null,
          );
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openRepayDialog(
    BuildContext context,
    List<FinanceAccount> accounts,
    FinanceAdvance advance,
  ) async {
    final result = await showDialog<_AdvanceRepayResult>(
      context: context,
      builder: (_) => _AdvanceRepayDialog(accounts: accounts, outstanding: advance.outstanding),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .addFinanceAdvanceRepayment(
            spaceId: widget.spaceId,
            advanceId: advance.id,
            amount: result.amount,
            accountId: result.accountId,
            date: result.date,
          );
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openRepaymentEditDialog(
    BuildContext context,
    List<FinanceAccount> accounts,
    FinanceAdvance advance,
    FinanceSettlementEntry repayment,
  ) async {
    final result = await showDialog<_AdvanceRepaymentEditResult>(
      context: context,
      builder: (_) => _AdvanceRepaymentEditDialog(accounts: accounts, repayment: repayment),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .updateFinanceAdvanceRepayment(
            spaceId: widget.spaceId,
            advanceId: advance.id,
            repaymentId: repayment.id,
            amount: result.amount,
            accountId: result.accountId,
            date: result.date,
            note: result.note ?? '',
          );
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}

class _AdvanceCard extends StatelessWidget {
  const _AdvanceCard({
    required this.advance,
    required this.accountNameOf,
    required this.onRepay,
    required this.onEdit,
    required this.onDelete,
    required this.onEditRepayment,
  });

  final FinanceAdvance advance;
  final Map<String, String> accountNameOf;
  final VoidCallback? onRepay;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final void Function(FinanceSettlementEntry repayment) onEditRepayment;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.request_quote_outlined, size: 18, color: scheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(advance.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
                if (advance.settled) ...[
                  const Chip(label: Text('已收回'), visualDensity: VisualDensity.compact),
                  const SizedBox(width: 4),
                ] else if (onRepay != null)
                  TextButton(onPressed: onRepay, child: const Text('登記收回')),
                IconButton(icon: const Icon(Icons.edit_outlined, size: 18), onPressed: onEdit),
                IconButton(icon: const Icon(Icons.delete_outline, size: 18), onPressed: onDelete),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '代墊 ${formatAmount(advance.amount)}（${accountNameOf[advance.accountId] ?? '?'}）'
              '${advance.settled ? '' : ' · 還剩 ${formatAmount(advance.outstanding)}'}'
              '${advance.projectName != null ? ' · ${advance.projectName}' : ''}',
              style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.7)),
            ),
            if (advance.note != null && advance.note!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  advance.note!,
                  style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            if (advance.repayments.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '已收回 ${advance.repayments.length} 筆，共 ${formatAmount(advance.repayments.fold<double>(0, (sum, r) => sum + r.amount))}',
                  style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.55)),
                ),
              ),
              for (final r in advance.repayments)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${r.date.year}/${r.date.month}/${r.date.day} · ${formatAmount(r.amount)}'
                          '（${accountNameOf[r.accountId] ?? '?'}）'
                          '${r.note != null && r.note!.isNotEmpty ? ' · ${r.note}' : ''}',
                          style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.55)),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 14),
                        visualDensity: VisualDensity.compact,
                        constraints: const BoxConstraints(),
                        padding: EdgeInsets.zero,
                        onPressed: () => onEditRepayment(r),
                      ),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AdvanceCreateResult {
  const _AdvanceCreateResult({
    required this.title,
    required this.amount,
    required this.accountId,
    required this.date,
    this.note,
    this.projectId,
  });

  final String title;
  final double amount;
  final String accountId;
  final DateTime date;
  final String? note;
  final String? projectId;
}

class _AdvanceCreateDialog extends StatefulWidget {
  const _AdvanceCreateDialog({required this.accounts, required this.projects, this.existing});

  final List<FinanceAccount> accounts;
  final List<MyProjectSummary> projects;
  final FinanceAdvance? existing;

  @override
  State<_AdvanceCreateDialog> createState() => _AdvanceCreateDialogState();
}

class _AdvanceCreateDialogState extends State<_AdvanceCreateDialog> {
  late String? _accountId = widget.existing?.accountId ?? widget.accounts.firstOrNull?.id;
  late String? _projectId = widget.existing?.projectId;
  late final _titleController = TextEditingController(text: widget.existing?.title ?? '');
  late final _amountController = TextEditingController(
    text: widget.existing == null ? '' : widget.existing!.amount.toStringAsFixed(0),
  );
  late final _noteController = TextEditingController(text: widget.existing?.note ?? '');
  late DateTime _date = widget.existing?.date ?? DateTime.now();

  @override
  void dispose() {
    _titleController.dispose();
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _submit() {
    final accountId = _accountId;
    final title = _titleController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (accountId == null || title.isEmpty || amount == null || amount <= 0) return;

    Navigator.of(context).pop(
      _AdvanceCreateResult(
        title: title,
        amount: amount,
        accountId: accountId,
        date: _date,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
        projectId: _projectId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.existing == null ? '新增代墊' : '編輯代墊'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: '說明（例如「材料款」）'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _amountController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '金額'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _accountId,
                decoration: const InputDecoration(labelText: '帳戶'),
                items: widget.accounts
                    .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name)))
                    .toList(),
                onChanged: (value) => setState(() => _accountId = value),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: '日期',
                    suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
                  ),
                  child: Text('${_date.year}/${_date.month}/${_date.day}'),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _projectId,
                decoration: const InputDecoration(labelText: '掛勾專案（選填）'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('不掛勾任何專案')),
                  for (final p in widget.projects)
                    DropdownMenuItem(value: p.id, child: Text('${p.name}（${p.spaceName}）')),
                ],
                onChanged: (value) => setState(() => _projectId = value),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _noteController,
                decoration: const InputDecoration(labelText: '備註（選填）'),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('儲存')),
      ],
    );
  }
}

class _AdvanceRepayResult {
  const _AdvanceRepayResult({required this.amount, required this.accountId, required this.date});

  final double amount;
  final String accountId;
  final DateTime date;
}

class _AdvanceRepayDialog extends StatefulWidget {
  const _AdvanceRepayDialog({required this.accounts, required this.outstanding});

  final List<FinanceAccount> accounts;
  final double outstanding;

  @override
  State<_AdvanceRepayDialog> createState() => _AdvanceRepayDialogState();
}

class _AdvanceRepayDialogState extends State<_AdvanceRepayDialog> {
  late String? _accountId = widget.accounts.firstOrNull?.id;
  late final _amountController = TextEditingController(text: widget.outstanding.toStringAsFixed(0));
  DateTime _date = DateTime.now();
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _submit() {
    final accountId = _accountId;
    final amount = double.tryParse(_amountController.text.trim());
    if (accountId == null || amount == null || amount <= 0) return;
    if (amount > widget.outstanding + 0.001) {
      setState(() => _error = '金額不能超過剩餘的 ${formatAmount(widget.outstanding)}');
      return;
    }
    Navigator.of(context).pop(_AdvanceRepayResult(amount: amount, accountId: accountId, date: _date));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('登記收回'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('剩餘 ${formatAmount(widget.outstanding)}'),
            const SizedBox(height: 12),
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: '收回金額', errorText: _error),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _accountId,
              decoration: const InputDecoration(labelText: '帳戶'),
              items: widget.accounts
                  .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name)))
                  .toList(),
              onChanged: (value) => setState(() => _accountId = value),
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: _pickDate,
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: '日期',
                  suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
                ),
                child: Text('${_date.year}/${_date.month}/${_date.day}'),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('儲存')),
      ],
    );
  }
}

class _AdvanceRepaymentEditResult {
  const _AdvanceRepaymentEditResult({
    required this.amount,
    required this.accountId,
    required this.date,
    this.note,
  });

  final double amount;
  final String accountId;
  final DateTime date;
  final String? note;
}

/// 編輯單筆收回紀錄——跟 `_AdvanceRepayDialog`（新增）不同的是這裡是編輯既有
/// 的一筆，所有欄位都預先帶入現值，也多了備註可以改（後端
/// `updateFinanceAdvanceRepayment` 本來就支援，之前只是 App 端沒有介面）。
class _AdvanceRepaymentEditDialog extends StatefulWidget {
  const _AdvanceRepaymentEditDialog({required this.accounts, required this.repayment});

  final List<FinanceAccount> accounts;
  final FinanceSettlementEntry repayment;

  @override
  State<_AdvanceRepaymentEditDialog> createState() => _AdvanceRepaymentEditDialogState();
}

class _AdvanceRepaymentEditDialogState extends State<_AdvanceRepaymentEditDialog> {
  late String? _accountId = widget.repayment.accountId;
  late final _amountController = TextEditingController(text: widget.repayment.amount.toStringAsFixed(0));
  late final _noteController = TextEditingController(text: widget.repayment.note ?? '');
  late DateTime _date = widget.repayment.date;

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _submit() {
    final accountId = _accountId;
    final amount = double.tryParse(_amountController.text.trim());
    if (accountId == null || amount == null || amount <= 0) return;

    Navigator.of(context).pop(
      _AdvanceRepaymentEditResult(
        amount: amount,
        accountId: accountId,
        date: _date,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('編輯收回'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: '收回金額'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _accountId,
              decoration: const InputDecoration(labelText: '帳戶'),
              items: widget.accounts
                  .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name)))
                  .toList(),
              onChanged: (value) => setState(() => _accountId = value),
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: _pickDate,
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: '日期',
                  suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
                ),
                child: Text('${_date.year}/${_date.month}/${_date.day}'),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteController,
              decoration: const InputDecoration(labelText: '備註（選填）'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('儲存')),
      ],
    );
  }
}
