import 'package:flutter/material.dart';

import 'tabs/my_approval_submissions_tab.dart';
import 'tabs/pending_approvals_tab.dart';

/// 簽核系統 — company-space level, cross-project. 待我簽核 (steps currently
/// awaiting the caller's own action) and 我送出的 (every approval the caller
/// has submitted, with full step/note detail so they can see who it's
/// currently with).
class ApprovalsHomeScreen extends StatefulWidget {
  const ApprovalsHomeScreen({super.key});

  @override
  State<ApprovalsHomeScreen> createState() => _ApprovalsHomeScreenState();
}

class _ApprovalsHomeScreenState extends State<ApprovalsHomeScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController = TabController(length: 2, vsync: this);

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
          tabs: const [
            Tab(text: '待我簽核'),
            Tab(text: '我送出的'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [
              PendingApprovalsTab(),
              MyApprovalSubmissionsTab(),
            ],
          ),
        ),
      ],
    );
  }
}
