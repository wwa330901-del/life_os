import 'package:flutter/material.dart';

import 'tabs/stock_holdings_tab.dart';
import 'tabs/stock_recurring_tab.dart';
import 'tabs/stock_transactions_tab.dart';

/// 投資股票系統 — 個人空間的第二個模組（跟記帳系統平行）。持股總覽（成本／
/// 現價／損益，derived server-side）、交易紀錄（手動買賣，T+2 自動交割）、
/// 定期定額（DCA 計畫，到期發 LINE 提醒，回覆後才記一筆）。
class StocksHomeScreen extends StatefulWidget {
  const StocksHomeScreen({super.key, required this.spaceId});

  final String spaceId;

  @override
  State<StocksHomeScreen> createState() => _StocksHomeScreenState();
}

class _StocksHomeScreenState extends State<StocksHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 3, vsync: this);

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
            Tab(text: '持股總覽'),
            Tab(text: '交易紀錄'),
            Tab(text: '定期定額'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              StockHoldingsTab(spaceId: widget.spaceId),
              StockTransactionsTab(spaceId: widget.spaceId),
              StockRecurringTab(spaceId: widget.spaceId),
            ],
          ),
        ),
      ],
    );
  }
}
