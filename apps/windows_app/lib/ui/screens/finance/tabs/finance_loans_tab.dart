import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/finance.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/finance_provider.dart';
import '../widgets/finance_format.dart';

/// 跟人借錢/借錢給人 — a lightweight receivable/payable ledger, independent
/// of 代墊 despite the similar mechanic (see the backend's `FinanceLoan`
/// doc comment for why). Only unsettled loans show by default — settled
/// ones would otherwise just pile up forever; a chip toggles showing them
/// too for history's sake.
class FinanceLoansTab extends ConsumerStatefulWidget {
  const FinanceLoansTab({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<FinanceLoansTab> createState() => _FinanceLoansTabState();
}

class _FinanceLoansTabState extends ConsumerState<FinanceLoansTab> {
  bool _showSettled = false;

  @override
  Widget build(BuildContext context) {
    final loansAsync = ref.watch(financeLoansProvider(widget.spaceId));
    final accountsAsync = ref.watch(financeAccountsProvider(widget.spaceId));
    final accounts = accountsAsync.value ?? const [];
    final accountNameOf = {for (final a in accounts) a.id: a.name};

    return Scaffold(
      floatingActionButton: accounts.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _openCreateDialog(context, accounts),
              icon: const Icon(Icons.add),
              label: const Text('新增借貸'),
            ),
      body: accounts.isEmpty
          ? const Center(child: Text('要先在「帳戶」分頁新增至少一個帳戶'))
          : loansAsync.when(
              data: (loans) {
                final visible = _showSettled ? loans : loans.where((l) => !l.settled).toList();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          const _PendingLoanInvitesButton(),
                          const SizedBox(width: 8),
                          FilterChip(
                            label: const Text('顯示已結清'),
                            selected: _showSettled,
                            onSelected: (v) => setState(() => _showSettled = v),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: visible.isEmpty
                          ? Center(
                              child: Text(_showSettled ? '還沒有任何借貸' : '目前沒有未結清的借貸'),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                              itemCount: visible.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (context, index) {
                                final loan = visible[index];
                                return _LoanCard(
                                  loan: loan,
                                  accountNameOf: accountNameOf,
                                  onRepay: loan.settled
                                      ? null
                                      : () => _openRepayDialog(context, accounts, loan),
                                  onEdit: () => _openEditDialog(context, accounts, loan),
                                  onDelete: () => _delete(context, loan),
                                  onInvite: loan.inviteSentToName == null
                                      ? () => _inviteConfirmation(context, loan)
                                      : null,
                                );
                              },
                            ),
                    ),
                  ],
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text('讀取借貸失敗：$error')),
            ),
    );
  }

  void _invalidate() => ref.invalidate(financeLoansProvider(widget.spaceId));

  Future<void> _inviteConfirmation(BuildContext context, FinanceLoan loan) async {
    final controller = TextEditingController();
    final email = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('邀請對方確認'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('對方要用元序帳號的 email、且接受邀請後，才會在他自己的帳戶自動建立一筆對應紀錄。'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(labelText: '對方的 email'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('送出邀請'),
          ),
        ],
      ),
    );
    if (email == null || email.isEmpty || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .inviteFinanceLoanConfirmation(spaceId: widget.spaceId, id: loan.id, email: email);
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(BuildContext context, FinanceLoan loan) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('刪除借貸'),
        content: const Text('確定要刪除這筆借貸紀錄嗎？連同已登記的還款一起刪除，這個動作無法復原。'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('刪除')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(apiClientProvider).deleteFinanceLoan(spaceId: widget.spaceId, id: loan.id);
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openCreateDialog(BuildContext context, List<FinanceAccount> accounts) async {
    final result = await showDialog<_LoanCreateResult>(
      context: context,
      builder: (_) => _LoanCreateDialog(accounts: accounts),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .createFinanceLoan(
            spaceId: widget.spaceId,
            direction: result.direction,
            counterpartyName: result.counterpartyName,
            amount: result.amount,
            accountId: result.accountId,
            date: result.date,
            note: result.note,
          );
      _invalidate();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _openEditDialog(BuildContext context, List<FinanceAccount> accounts, FinanceLoan loan) async {
    final result = await showDialog<_LoanCreateResult>(
      context: context,
      builder: (_) => _LoanCreateDialog(accounts: accounts, existing: loan),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .updateFinanceLoan(
            spaceId: widget.spaceId,
            id: loan.id,
            counterpartyName: result.counterpartyName,
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

  Future<void> _openRepayDialog(
    BuildContext context,
    List<FinanceAccount> accounts,
    FinanceLoan loan,
  ) async {
    final result = await showDialog<_RepayResult>(
      context: context,
      builder: (_) => _RepayDialog(accounts: accounts, outstanding: loan.outstanding),
    );
    if (result == null || !context.mounted) return;

    try {
      await ref
          .read(apiClientProvider)
          .addFinanceLoanRepayment(
            spaceId: widget.spaceId,
            loanId: loan.id,
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
}

class _LoanCard extends StatelessWidget {
  const _LoanCard({
    required this.loan,
    required this.accountNameOf,
    required this.onRepay,
    required this.onEdit,
    required this.onDelete,
    required this.onInvite,
  });

  final FinanceLoan loan;
  final Map<String, String> accountNameOf;
  final VoidCallback? onRepay;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  /// Null 表示已經邀請過對方（不管對方接受了沒），不再重複顯示邀請按鈕。
  final VoidCallback? onInvite;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = loan.direction == FinanceLoanDirection.lend
        ? '借給 ${loan.counterpartyName}'
        : '跟 ${loan.counterpartyName} 借';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  loan.direction == FinanceLoanDirection.lend
                      ? Icons.call_made
                      : Icons.call_received,
                  size: 18,
                  color: scheme.primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
                if (loan.settled) ...[
                  const Chip(label: Text('已結清'), visualDensity: VisualDensity.compact),
                  const SizedBox(width: 4),
                ] else if (onRepay != null)
                  TextButton(onPressed: onRepay, child: const Text('登記還款')),
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  onPressed: onEdit,
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18),
                  onPressed: onDelete,
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '本金 ${formatAmount(loan.amount)}（${accountNameOf[loan.accountId] ?? '?'}）'
              '${loan.settled ? '' : ' · 還剩 ${formatAmount(loan.outstanding)}'}',
              style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.7)),
            ),
            if (loan.note != null && loan.note!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(loan.note!, style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6))),
              ),
            if (loan.repayments.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '已還款 ${loan.repayments.length} 筆，共 ${formatAmount(loan.repayments.fold<double>(0, (sum, r) => sum + r.amount))}',
                  style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.55)),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: onInvite != null
                  ? OutlinedButton.icon(
                      onPressed: onInvite,
                      icon: const Icon(Icons.person_add_alt_outlined, size: 14),
                      label: const Text('邀請對方確認', style: TextStyle(fontSize: 12)),
                      style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                    )
                  : Text(
                      loan.inviteAccepted == true
                          ? '✓ ${loan.inviteSentToName} 已接受，對方帳戶已建立對應紀錄'
                          : '已邀請 ${loan.inviteSentToName} 確認，等待對方接受',
                      style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.55)),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoanCreateResult {
  const _LoanCreateResult({
    required this.direction,
    required this.counterpartyName,
    required this.amount,
    required this.accountId,
    required this.date,
    this.note,
  });

  final FinanceLoanDirection direction;
  final String counterpartyName;
  final double amount;
  final String accountId;
  final DateTime date;
  final String? note;
}

class _LoanCreateDialog extends StatefulWidget {
  const _LoanCreateDialog({required this.accounts, this.existing});

  final List<FinanceAccount> accounts;

  /// Non-null when editing an existing loan — `direction` stays fixed (see
  /// `FinanceLoansService.update`'s doc comment for why: it decides which
  /// way every repayment's `type` was recorded, so changing it after any
  /// repayment exists would desync them).
  final FinanceLoan? existing;

  @override
  State<_LoanCreateDialog> createState() => _LoanCreateDialogState();
}

class _LoanCreateDialogState extends State<_LoanCreateDialog> {
  late FinanceLoanDirection _direction = widget.existing?.direction ?? FinanceLoanDirection.lend;
  late String? _accountId = widget.existing?.accountId ?? widget.accounts.firstOrNull?.id;
  late final _counterpartyController = TextEditingController(text: widget.existing?.counterpartyName ?? '');
  late final _amountController = TextEditingController(
    text: widget.existing == null ? '' : widget.existing!.amount.toStringAsFixed(0),
  );
  late final _noteController = TextEditingController(text: widget.existing?.note ?? '');
  late DateTime _date = widget.existing?.date ?? DateTime.now();

  @override
  void dispose() {
    _counterpartyController.dispose();
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
    final counterpartyName = _counterpartyController.text.trim();
    final amount = double.tryParse(_amountController.text.trim());
    if (accountId == null || counterpartyName.isEmpty || amount == null || amount <= 0) return;

    Navigator.of(context).pop(
      _LoanCreateResult(
        direction: _direction,
        counterpartyName: counterpartyName,
        amount: amount,
        accountId: accountId,
        date: _date,
        note: _noteController.text.trim().isEmpty ? null : _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.existing != null;
    return AlertDialog(
      title: Text(isEditing ? '編輯借貸' : '新增借貸'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<FinanceLoanDirection>(
                segments: const [
                  ButtonSegment(value: FinanceLoanDirection.lend, label: Text('借出去')),
                  ButtonSegment(value: FinanceLoanDirection.borrow, label: Text('借進來')),
                ],
                selected: {_direction},
                onSelectionChanged: isEditing
                    ? null
                    : (selection) => setState(() => _direction = selection.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _counterpartyController,
                decoration: InputDecoration(
                  labelText: _direction == FinanceLoanDirection.lend ? '借給誰' : '跟誰借',
                ),
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
        FilledButton(onPressed: _submit, child: Text(isEditing ? '儲存' : '新增')),
      ],
    );
  }
}

class _RepayResult {
  const _RepayResult({required this.amount, required this.accountId, required this.date});

  final double amount;
  final String accountId;
  final DateTime date;
}

class _RepayDialog extends StatefulWidget {
  const _RepayDialog({required this.accounts, required this.outstanding});

  final List<FinanceAccount> accounts;
  final double outstanding;

  @override
  State<_RepayDialog> createState() => _RepayDialogState();
}

class _RepayDialogState extends State<_RepayDialog> {
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
    Navigator.of(context).pop(_RepayResult(amount: amount, accountId: accountId, date: _date));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('登記還款'),
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
              decoration: InputDecoration(labelText: '還款金額', errorText: _error),
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

/// 收到的借出/借入互通邀請——有待處理的就顯示數字徽章，點下去開對話框
/// 接受/拒絕。
class _PendingLoanInvitesButton extends ConsumerWidget {
  const _PendingLoanInvitesButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitesAsync = ref.watch(financeLoanInvitesReceivedProvider);
    final pendingCount = invitesAsync.value?.where((i) => !i.accepted).length ?? 0;

    return Badge(
      label: Text('$pendingCount'),
      isLabelVisible: pendingCount > 0,
      child: OutlinedButton.icon(
        onPressed: () => _showDialog(context),
        icon: const Icon(Icons.mail_outline, size: 16),
        label: const Text('借貸邀請'),
      ),
    );
  }

  void _showDialog(BuildContext context) {
    showDialog<void>(context: context, builder: (_) => const _LoanInvitesDialog());
  }
}

class _LoanInvitesDialog extends ConsumerWidget {
  const _LoanInvitesDialog();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitesAsync = ref.watch(financeLoanInvitesReceivedProvider);

    return Dialog(
      child: SizedBox(
        width: 420,
        height: 480,
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Align(alignment: Alignment.centerLeft, child: Text('收到的借貸邀請')),
            ),
            Expanded(
              child: invitesAsync.when(
                data: (invites) {
                  if (invites.isEmpty) {
                    return const Center(child: Text('目前沒有任何邀請'));
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: invites.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final invite = invites[index];
                      // 對方登記的方向是「他」的視角，接受後在我這邊會是相反方向。
                      final myDirection = invite.direction == FinanceLoanDirection.lend
                          ? FinanceLoanDirection.borrow
                          : FinanceLoanDirection.lend;
                      final label = myDirection == FinanceLoanDirection.lend
                          ? '你借給 ${invite.fromUserName}'
                          : '你跟 ${invite.fromUserName} 借';
                      return Card(
                        child: ListTile(
                          title: Text(label),
                          subtitle: Text(
                            '${formatAmount(invite.amount)} · ${invite.date.year}/${invite.date.month}/${invite.date.day}'
                            '${invite.accepted ? '（已接受）' : ''}',
                          ),
                          trailing: invite.accepted
                              ? null
                              : Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    TextButton(
                                      onPressed: () => _accept(context, ref, invite),
                                      child: const Text('接受'),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.close, size: 18),
                                      tooltip: '拒絕',
                                      onPressed: () => _decline(context, ref, invite),
                                    ),
                                  ],
                                ),
                        ),
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(child: Text('讀取失敗：$error')),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _accept(BuildContext context, WidgetRef ref, FinanceLoanInvite invite) async {
    try {
      await ref.read(apiClientProvider).acceptFinanceLoanInvite(invite.id);
      ref.invalidate(financeLoanInvitesReceivedProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _decline(BuildContext context, WidgetRef ref, FinanceLoanInvite invite) async {
    try {
      await ref.read(apiClientProvider).removeFinanceLoanInvite(invite.id);
      ref.invalidate(financeLoanInvitesReceivedProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }
}
