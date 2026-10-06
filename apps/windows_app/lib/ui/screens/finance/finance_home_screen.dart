import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
import 'widgets/finance_reset_dialog.dart';

/// First 個人功能 module: a personal-space 記帳系統 — 總覽 (monthly income/
/// expense chart + budget progress), 交易 (transaction log), 帳戶 (cash/bank/
/// credit-card balances), 分類 (user-managed income/expense categories),
/// 預算 (per-category monthly targets), 定期交易 (monthly recurring entries
/// like a credit card bill or rent, with a LINE reminder/auto-record), 借貸
/// (跟人借錢/借錢給人), 代墊 (工作上先幫忙出錢，之後公司/專案還你).
class FinanceHomeScreen extends ConsumerStatefulWidget {
  const FinanceHomeScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  ConsumerState<FinanceHomeScreen> createState() => _FinanceHomeScreenState();
}

class _FinanceHomeScreenState extends ConsumerState<FinanceHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 12, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Widget _buildTabBar() => TabBar(
    controller: _tabController,
    isScrollable: true,
    tabAlignment: TabAlignment.start,
    tabs: const [
      Tab(text: '總覽'),
      Tab(text: '規劃'),
      Tab(text: '交易'),
      Tab(text: '帳戶'),
      Tab(text: '分類'),
      Tab(text: '預算'),
      Tab(text: '定期交易'),
      Tab(text: '借貸'),
      Tab(text: '代墊'),
      Tab(text: '購物車'),
      Tab(text: '退休'),
      Tab(text: '報表'),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: _buildTabBar()),
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: () => showFinanceResetDialog(context, ref, widget.spaceId),
                icon: const Icon(Icons.restart_alt, size: 18),
                label: const Text('清空重來'),
              ),
            ),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              FinanceOverviewTab(spaceId: widget.spaceId),
              FinancePlanTab(spaceId: widget.spaceId),
              FinanceTransactionsTab(spaceId: widget.spaceId),
              FinanceAccountsTab(spaceId: widget.spaceId),
              FinanceCategoriesTab(spaceId: widget.spaceId),
              FinanceBudgetsTab(spaceId: widget.spaceId),
              FinanceRecurringTab(spaceId: widget.spaceId),
              FinanceLoansTab(spaceId: widget.spaceId),
              FinanceAdvancesTab(spaceId: widget.spaceId),
              const FinanceWishlistTab(),
              const FinanceRetirementTab(),
              FinanceReportTab(spaceId: widget.spaceId),
            ],
          ),
        ),
      ],
    );
  }
}
