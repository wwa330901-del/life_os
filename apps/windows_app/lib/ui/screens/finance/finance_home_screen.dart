import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/finance.dart';
import '../../../state/app_layout_provider.dart';
import '../../../state/auth_provider.dart';
import '../../../state/finance_provider.dart';
import '../../../state/home_provider.dart';
import '../../widgets/error_panel.dart';
import 'tabs/finance_accounts_tab.dart';
import 'tabs/finance_advances_tab.dart';
import 'tabs/finance_budgets_tab.dart';
import 'tabs/finance_categories_tab.dart';
import 'tabs/finance_loans_tab.dart';
import 'tabs/finance_overview_tab.dart';
import 'tabs/finance_plan_tab.dart';
import 'tabs/finance_recurring_tab.dart';
import 'tabs/finance_report_tab.dart';
import 'tabs/finance_retirement_tab.dart';
import 'tabs/finance_transactions_tab.dart';
import 'tabs/finance_wishlist_tab.dart';
import 'widgets/finance_format.dart';
import 'widgets/finance_reset_dialog.dart';

/// 記帳裡的每一個頁面（以前是 12 個分頁，2026-11-22 依版面重新分組）。
enum FinanceSection {
  overview('總覽'),
  report('報表'),
  transactions('每一筆'),
  recurring('每月固定的'),
  categories('分類'),
  accounts('帳戶'),
  budgets('預算'),
  loans('借貸'),
  advances('代墊'),
  plan('財務規劃'),
  wishlist('購物車'),
  retirement('退休試算');

  const FinanceSection(this.label);

  final String label;

  Widget build(String spaceId) => switch (this) {
    FinanceSection.overview => FinanceOverviewTab(spaceId: spaceId),
    FinanceSection.report => FinanceReportTab(spaceId: spaceId),
    FinanceSection.transactions => FinanceTransactionsTab(spaceId: spaceId),
    FinanceSection.recurring => FinanceRecurringTab(spaceId: spaceId),
    FinanceSection.categories => FinanceCategoriesTab(spaceId: spaceId),
    FinanceSection.accounts => FinanceAccountsTab(spaceId: spaceId),
    FinanceSection.budgets => FinanceBudgetsTab(spaceId: spaceId),
    FinanceSection.loans => FinanceLoansTab(spaceId: spaceId),
    FinanceSection.advances => FinanceAdvancesTab(spaceId: spaceId),
    FinanceSection.plan => FinancePlanTab(spaceId: spaceId),
    FinanceSection.wishlist => const FinanceWishlistTab(),
    FinanceSection.retirement => const FinanceRetirementTab(),
  };
}

class _Group {
  const _Group(this.label, this.sections, [this.hint = '']);

  final String label;
  final List<FinanceSection> sections;
  final String hint;
}

/// A 功能卡片：5 組分頁。
const _cardsGroups = [
  _Group('總覽', [FinanceSection.overview, FinanceSection.report]),
  _Group('記錄', [FinanceSection.transactions, FinanceSection.recurring, FinanceSection.categories]),
  _Group('帳戶與預算', [FinanceSection.accounts, FinanceSection.budgets]),
  _Group('借還款', [FinanceSection.loans, FinanceSection.advances]),
  _Group('規劃', [FinanceSection.plan, FinanceSection.wishlist, FinanceSection.retirement]),
];

/// C AI 優先：3 個大分頁，下面寫裡面有什麼。
const _aiGroups = [
  _Group('這個月', [FinanceSection.overview, FinanceSection.transactions, FinanceSection.budgets], '花多少、每一筆、預算'),
  _Group('帳戶', [FinanceSection.accounts, FinanceSection.recurring, FinanceSection.categories], '餘額、平帳、每月固定的'),
  _Group(
    '計畫與借還',
    [
      FinanceSection.plan,
      FinanceSection.wishlist,
      FinanceSection.retirement,
      FinanceSection.loans,
      FinanceSection.advances,
      FinanceSection.report,
    ],
    '規劃、購物車、退休、借貸、代墊',
  ),
];

/// B 左邊選單：「更多功能」裡的。
const _moreSections = [
  FinanceSection.budgets,
  FinanceSection.recurring,
  FinanceSection.accounts,
  FinanceSection.loans,
  FinanceSection.advances,
  FinanceSection.wishlist,
  FinanceSection.plan,
  FinanceSection.retirement,
  FinanceSection.report,
  FinanceSection.overview,
  FinanceSection.categories,
];

class FinanceHomeScreen extends ConsumerWidget {
  const FinanceHomeScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return switch (ref.watch(appLayoutProvider)) {
      AppLayout.cards => _GroupedFinance(spaceId: spaceId, groups: _cardsGroups, big: false),
      AppLayout.ai => _GroupedFinance(spaceId: spaceId, groups: _aiGroups, big: true),
      AppLayout.sidebar => _OnePageFinance(spaceId: spaceId),
    };
  }
}

Widget _resetButton(BuildContext context, WidgetRef ref, String spaceId) => TextButton.icon(
  onPressed: () => showFinanceResetDialog(context, ref, spaceId),
  icon: const Icon(Icons.restart_alt, size: 18),
  label: const Text('清空重來'),
);

/// A、C：上面分組，組裡面再用圓角按鈕切換。
class _GroupedFinance extends ConsumerStatefulWidget {
  const _GroupedFinance({required this.spaceId, required this.groups, required this.big});

  final String spaceId;
  final List<_Group> groups;

  /// C 版：大分頁（有說明）＋上面一條「用說的記帳」。
  final bool big;

  @override
  ConsumerState<_GroupedFinance> createState() => _GroupedFinanceState();
}

class _GroupedFinanceState extends ConsumerState<_GroupedFinance> {
  int _group = 0;
  final Map<int, FinanceSection> _sub = {};

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final group = widget.groups[_group];
    final section = _sub[_group] ?? group.sections.first;

    final groupBar = widget.big
        ? Row(
            children: [
              for (var i = 0; i < widget.groups.length; i++)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: _BigTab(
                      label: widget.groups[i].label,
                      hint: widget.groups[i].hint,
                      selected: i == _group,
                      onTap: () => setState(() => _group = i),
                    ),
                  ),
                ),
            ],
          )
        : SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < widget.groups.length; i++)
                  _GroupTab(label: widget.groups[i].label, selected: i == _group, onTap: () => setState(() => _group = i)),
              ],
            ),
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.big)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Expanded(child: _QuickRecordField(spaceId: widget.spaceId)),
                _resetButton(context, ref, widget.spaceId),
              ],
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(12, widget.big ? 12 : 4, 8, 0),
          child: widget.big
              ? groupBar
              : Row(children: [Expanded(child: groupBar), _resetButton(context, ref, widget.spaceId)]),
        ),
        if (!widget.big) Divider(height: 1, color: scheme.outline.withValues(alpha: 0.2)),
        if (group.sections.length > 1)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in group.sections)
                  ChoiceChip(label: Text(s.label), selected: s == section, onSelected: (_) => setState(() => _sub[_group] = s)),
              ],
            ),
          ),
        Expanded(child: KeyedSubtree(key: ValueKey(section), child: section.build(widget.spaceId))),
      ],
    );
  }
}

class _GroupTab extends StatelessWidget {
  const _GroupTab({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: selected ? scheme.primary : Colors.transparent, width: 3)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
            color: selected ? scheme.onSurface : scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _BigTab extends StatelessWidget {
  const _BigTab({required this.label, required this.hint, required this.selected, required this.onTap});

  final String label;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: selected ? scheme.primary : scheme.outline.withValues(alpha: 0.3), width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Column(
            children: [
              Text(label, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: selected ? scheme.primary : null)),
              const SizedBox(height: 2),
              Text(
                hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// C 版記帳上面那條：直接打「午餐 120 刷卡」交給 AI 記。
class _QuickRecordField extends ConsumerStatefulWidget {
  const _QuickRecordField({required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<_QuickRecordField> createState() => _QuickRecordFieldState();
}

class _QuickRecordFieldState extends ConsumerState<_QuickRecordField> {
  final _controller = TextEditingController();
  bool _sending = false;
  String? _interactionId;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final answer = await ref
          .read(apiClientProvider)
          .askAiAssistant(question: text, previousInteractionId: _interactionId);
      _interactionId = answer.interactionId;
      _controller.clear();
      ref.invalidate(financeTransactionsProvider);
      ref.invalidate(financeAccountsProvider);
      ref.invalidate(homeDashboardProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(answer.answer), duration: const Duration(seconds: 8)),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onSubmitted: (_) => _send(),
      decoration: InputDecoration(
        hintText: '直接打字記帳：午餐 120 刷卡（AI 會問你確認）',
        isDense: true,
        border: const OutlineInputBorder(),
        suffixIcon: _sending
            ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)))
            : IconButton(tooltip: '送出', icon: const Icon(Icons.send), onPressed: _send),
      ),
    );
  }
}

/// B 左邊選單：沒有分頁，打開就是餘額＋每一筆，少用的收在「更多功能」。
class _OnePageFinance extends ConsumerStatefulWidget {
  const _OnePageFinance({required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<_OnePageFinance> createState() => _OnePageFinanceState();
}

class _OnePageFinanceState extends ConsumerState<_OnePageFinance> {
  FinanceSection _section = FinanceSection.transactions;

  Future<void> _openMore() async {
    final picked = await showDialog<FinanceSection>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('更多功能'),
        content: SizedBox(
          width: 420,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in _moreSections)
                SizedBox(
                  width: 128,
                  child: FilledButton.tonal(
                    onPressed: () => Navigator.of(context).pop(s),
                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                    child: Text(s.label),
                  ),
                ),
            ],
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
      ),
    );
    if (picked != null) setState(() => _section = picked);
  }

  @override
  Widget build(BuildContext context) {
    final accounts = ref.watch(financeAccountsProvider(widget.spaceId)).value ?? const <FinanceAccount>[];
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 0),
          child: Row(
            children: [
              Text(
                _section == FinanceSection.transactions ? '記帳' : _section.label,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 12),
              if (_section != FinanceSection.transactions)
                TextButton.icon(
                  onPressed: () => setState(() => _section = FinanceSection.transactions),
                  icon: const Icon(Icons.chevron_left),
                  label: const Text('回到每一筆'),
                ),
              const Spacer(),
              FilledButton.tonalIcon(onPressed: _openMore, icon: const Icon(Icons.apps), label: const Text('更多功能')),
              const SizedBox(width: 8),
              _resetButton(context, ref, widget.spaceId),
            ],
          ),
        ),
        if (_section == FinanceSection.transactions && accounts.isNotEmpty)
          SizedBox(
            height: 72,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              children: [
                for (final a in accounts)
                  Padding(
                    padding: const EdgeInsets.only(right: 10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: scheme.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: scheme.outline.withValues(alpha: 0.25)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(a.name, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                          Text(
                            a.type == FinanceAccountType.creditCard && a.balance < 0
                                ? '欠 ${formatAmount(-a.balance)}'
                                : formatAmount(a.balance),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        Expanded(child: KeyedSubtree(key: ValueKey(_section), child: _section.build(widget.spaceId))),
      ],
    );
  }
}
