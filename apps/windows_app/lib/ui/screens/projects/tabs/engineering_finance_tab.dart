import 'package:flutter/material.dart';

import 'engineering_finance/cost_control_tab.dart';
import 'engineering_finance/payment_requests_tab.dart';
import 'engineering_finance/procurement_tab.dart';
import 'engineering_finance/quotation_tab.dart';

/// 工程財務四表的容器 — 工程報價單/採發比價表/成控管制表/工程請款單四張表
/// 內部再用一層 TabBar 切換，不直接鋪平在 ProjectDetailScreen 的頂層分頁
/// （會太多）。
class EngineeringFinanceTab extends StatelessWidget {
  const EngineeringFinanceTab({super.key, required this.projectId});

  final String projectId;

  static const _subTabs = [
    Tab(text: '工程報價單'),
    Tab(text: '採發比價表'),
    Tab(text: '成控管制表'),
    Tab(text: '工程請款單'),
  ];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DefaultTabController(
      length: _subTabs.length,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
            ),
            child: const TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: _subTabs),
          ),
          Expanded(
            child: TabBarView(
              children: [
                QuotationTab(projectId: projectId),
                ProcurementTab(projectId: projectId),
                CostControlTab(projectId: projectId),
                PaymentRequestsTab(projectId: projectId),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
