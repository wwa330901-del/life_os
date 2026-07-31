import 'package:flutter/material.dart';

import 'tabs/finance_accounts_tab.dart';
import 'tabs/finance_budgets_tab.dart';
import 'tabs/finance_categories_tab.dart';
import 'tabs/finance_overview_tab.dart';
import 'tabs/finance_recurring_tab.dart';
import 'tabs/finance_transactions_tab.dart';

/// First 個人功能 module: a personal-space 記帳系統 — 總覽 (monthly income/
/// expense chart + budget progress), 交易 (transaction log), 帳戶 (cash/bank/
/// credit-card balances), 分類 (user-managed income/expense categories),
/// 預算 (per-category monthly targets), 定期交易 (monthly recurring entries
/// like a credit card bill or rent, with a LINE reminder/auto-record).
class FinanceHomeScreen extends StatefulWidget {
  const FinanceHomeScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  State<FinanceHomeScreen> createState() => _FinanceHomeScreenState();
}

class _FinanceHomeScreenState extends State<FinanceHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 6, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: '總覽'),
            Tab(text: '交易'),
            Tab(text: '帳戶'),
            Tab(text: '分類'),
            Tab(text: '預算'),
            Tab(text: '定期交易'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              FinanceOverviewTab(spaceId: widget.spaceId),
              FinanceTransactionsTab(spaceId: widget.spaceId),
              FinanceAccountsTab(spaceId: widget.spaceId),
              FinanceCategoriesTab(spaceId: widget.spaceId),
              FinanceBudgetsTab(spaceId: widget.spaceId),
              FinanceRecurringTab(spaceId: widget.spaceId),
            ],
          ),
        ),
      ],
    );
  }
}
