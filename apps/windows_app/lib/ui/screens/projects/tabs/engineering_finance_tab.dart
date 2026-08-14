import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../state/project_editor_provider.dart';
import 'engineering_finance/cost_control_tab.dart';
import 'engineering_finance/payment_request_periods_tab.dart';
import 'engineering_finance/procurement_tab.dart';
import 'engineering_finance/quotation_tab.dart';
import 'engineering_finance/vendor_management_screen.dart';

/// 工程財務四表的容器 — 工程報價單/採發比價表/成控管制表/工程請款單四張表
/// 內部再用一層 TabBar 切換，不直接鋪平在 ProjectDetailScreen 的頂層分頁
/// （會太多）。右上角「廠商管理」是這個公司空間共用的廠商主檔，跟四張表
/// 平行、不屬於任何一張子表。
class EngineeringFinanceTab extends ConsumerWidget {
  const EngineeringFinanceTab({super.key, required this.projectId});

  final String projectId;

  static const _subTabs = [
    Tab(text: '工程報價單'),
    Tab(text: '採發比價表'),
    Tab(text: '成控管制表'),
    Tab(text: '工程請款單'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final spaceId = ref.watch(projectEditorProvider(projectId).select((v) => v.value?.project.spaceId));

    return DefaultTabController(
      length: _subTabs.length,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.25))),
            ),
            child: Row(
              children: [
                const Expanded(child: TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: _subTabs)),
                if (spaceId != null)
                  TextButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => VendorManagementScreen(spaceId: spaceId)),
                    ),
                    icon: const Icon(Icons.store_outlined, size: 18),
                    label: const Text('廠商管理'),
                  ),
                const SizedBox(width: 8),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [
                QuotationTab(projectId: projectId),
                ProcurementTab(projectId: projectId),
                CostControlTab(projectId: projectId),
                PaymentRequestPeriodsTab(projectId: projectId),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
