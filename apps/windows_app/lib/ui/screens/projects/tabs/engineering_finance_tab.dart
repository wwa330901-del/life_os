import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'engineering_finance/cost_control_tab.dart';
import 'engineering_finance/owner_billing_tab.dart';
import 'engineering_finance/payment_request_periods_tab.dart';
import 'engineering_finance/procurement_tab.dart';
import 'engineering_finance/quotation_tab.dart';

/// 工程財務表格的容器 — 工程報價單/採發比價表/成控管制表/工程請款單（對
/// 廠商）/估驗計價（對業主，2026-09 新增，顧問文件「對業主（估驗計價）＋
/// 對廠商兩類請款單」的業主端那一半）內部再用一層 TabBar 切換，不直接鋪
/// 平在 ProjectDetailScreen 的頂層分頁（會太多）。廠商管理雖然是這幾張表
/// 共用的公司空間主檔，但不掛在這裡底下——它是空間層級的獨立系統，入口在
/// 側邊欄（見 `AppSidebar`），不是某個專案的子畫面，2026-08-15 從這裡的
/// 右上角按鈕移過去。
class EngineeringFinanceTab extends ConsumerWidget {
  const EngineeringFinanceTab({super.key, required this.projectId, required this.spaceName});

  final String projectId;
  final String spaceName;

  static const _subTabs = [
    Tab(text: '工程報價單'),
    Tab(text: '採發比價表'),
    Tab(text: '成控管制表'),
    Tab(text: '工程請款單'),
    Tab(text: '估驗計價'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                QuotationTab(projectId: projectId, spaceName: spaceName),
                ProcurementTab(projectId: projectId),
                CostControlTab(projectId: projectId),
                PaymentRequestPeriodsTab(projectId: projectId),
                OwnerBillingTab(projectId: projectId),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
